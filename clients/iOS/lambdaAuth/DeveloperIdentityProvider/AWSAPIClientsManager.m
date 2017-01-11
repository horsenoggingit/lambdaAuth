//
//  AWSAPIClientsManager.m
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "AWSAPIClientsManager.h"
#import "DeveloperAuthenticatedIdentityProvider.h"
#import "UICKeyChainStore.h"


#define AWSAPIClientsManagerDomanin @"AWSAPIClientsManagerDomanin"

@implementation AWSAPIClientsManager

AWSRegionType __AWSRegionType;
UICKeyChainStore  *__keychain;

MYPREFIXAuthClient *__apiUnAuthInstance;
MYPREFIXAuthClient *__apiAuthInstance;

+(void)initialize {
    if (self == [AWSAPIClientsManager class]) {
        static dispatch_once_t onceToken;
        
        dispatch_once(&onceToken, ^{
            __keychain = [UICKeyChainStore keyChainStoreWithService:@"com.lambdaAuth.AWSAPIClientsManager"];
        });
    }
}

#pragma mark - client getters
+(MYPREFIXAuthClient *)unauthedClient {
    if (!__apiUnAuthInstance) {
        
        AWSServiceConfiguration *configuration = [[AWSServiceConfiguration alloc] initWithRegion:AWSRegionUnknown
                                                                             credentialsProvider:nil];
       
        [MYPREFIXAuthClient registerClientWithConfiguration:configuration forKey:@"unAuthClient"];
       
        __apiUnAuthInstance = [MYPREFIXAuthClient clientForKey:@"unAuthClient"];
    }
    return __apiUnAuthInstance;
}

+(MYPREFIXAuthClient *)authedClient {
    return __apiAuthInstance;
}

+(BOOL)isAuthenticated {
    return  ([self loginsForProvider]);
}

#pragma mark - auth configuration

+(void)setAuthedClient {
    [self setAuthedClientWithIdentityId:nil token:nil error:nil];
}

+(void)setAuthedClientWithIdentityId:(NSString *)identityID token:(NSString *)token error:(NSError **)error {
    if (identityID && token) {
        [self clearLogins];
        NSArray *identityIDComponents = [identityID componentsSeparatedByString:@":"];
        if (identityIDComponents.count < 2) {
            if (error) {
                *error = [[NSError alloc] initWithDomain:AWSAPIClientsManagerDomanin code:0 userInfo:@{NSLocalizedDescriptionKey : @"invalid IdentityId"}];
            }
            return;
        }
        __keychain[@"poolRegionString"] = identityIDComponents[0];
    }

    __AWSRegionType = [__keychain[@"poolRegionString"] aws_regionTypeValue];
    
    DeveloperAuthenticatedIdentityProvider * devAuth = [[DeveloperAuthenticatedIdentityProvider alloc] initWithRegionType:__AWSRegionType
                                                                                                           identityPoolId:@""
                                                                                                          useEnhancedFlow:YES
                                                                                                  identityProviderManager:nil
                                                        devAuthenticationTaskBlock:^AWSTask *{
                                                            if (![self isAuthenticated]) {
                                                                DeveloperAuthenticationResponse *devAuthResponse = [DeveloperAuthenticationResponse new];
                                                                devAuthResponse.identityId = identityID;
                                                                devAuthResponse.token = token;
                                                                return [AWSTask taskWithResult:devAuthResponse];
                                                            }
                                                            
                                                            MYPREFIXTokenRequest *tokenRequest = [MYPREFIXTokenRequest new];
                                                            tokenRequest.providerName = __keychain[@"providerName"];
                                                            tokenRequest._id = [self loginForProviderName:__keychain[@"providerName"]];
                                                            tokenRequest.deviceId = [AWSAPIClientsManager deviceId];
                                                            AWSTask *tokenTask = [[AWSAPIClientsManager unauthedClient] tokenPost:tokenRequest];
                                                            [tokenTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
                                                                if (task.error) {
                                                                    if (task.error.userInfo[@"HTTPBody"]) {
                                                                        NSError *error;
                                                                        // should have a common error handling utility.
                                                                        MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                                                                        NSLog(@"%@", myError.description);
                                                                    } else {
                                                                        NSLog(@"%@", task.error.description);
                                                                    }
                                                                    
                                                                    return [AWSTask taskWithError:task.error];
                                                                }
                                                                MYPREFIXCredentials *credentials = task.result;
                                                                DeveloperAuthenticationResponse *devAuthResponse = [DeveloperAuthenticationResponse new];
                                                                devAuthResponse.identityId = credentials.identityId;
                                                                devAuthResponse.token = credentials.token;
                                                                return [AWSTask taskWithResult:devAuthResponse];
                                                            }];
                                                            return tokenTask;
                                                        }];

    AWSCognitoCredentialsProvider *credentialsProvider = [[AWSCognitoCredentialsProvider alloc]
                                                          initWithRegionType:__AWSRegionType
                                                          identityProvider:devAuth];
    AWSServiceConfiguration *configuration = [[AWSServiceConfiguration alloc] initWithRegion:__AWSRegionType
                                                                         credentialsProvider:credentialsProvider];
    [MYPREFIXAuthClient registerClientWithConfiguration:configuration forKey:@"authClient"];

    __apiAuthInstance = [MYPREFIXAuthClient clientForKey:@"authClient"];
    
    
    // get the user to obtain logins
    AWSTask *meGetTask = [__apiAuthInstance userMeGet];
    [meGetTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            NSLog(@"got something");
            
            if (task.error) {
                if (task.error.userInfo[@"HTTPBody"]) {
                    NSError *error;
                    MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                    NSLog(@"%@", myError.description);
                } else {
                    NSLog(@"%@", task.error.description);
                }
                return;
            }
            MYPREFIXUser *user = task.result;
            __keychain[@"providerName"] = user.providerName;
            [self setLogin:user.logins[user.providerName] forProviderName:__keychain[@"providerName"]];
        });
        
        return nil;
    }];
}


#pragma mark - utilities
+(NSString *)deviceId {
    if (!__keychain[@"UUID"]) {
        __keychain[@"UUID"] = [[NSUUID UUID] UUIDString];
    }
    
    return __keychain[@"UUID"];
}

+(void)invalidateAuth {
    if (__apiAuthInstance) {
        [(AWSCognitoCredentialsProvider *)__apiAuthInstance.configuration.credentialsProvider clearCredentials];
        [[(AWSCognitoCredentialsProvider *)__apiAuthInstance.configuration.credentialsProvider identityProvider] clear];
    }
}

+(void)logout {
    [self clearLogins];
    [self invalidateAuth];
    __apiAuthInstance = nil;
    [MYPREFIXAuthClient removeClientForKey:@"authClient"];
}

+(void)setLogin:(NSString *)login forProviderName:(NSString *)providerName {
    __keychain[providerName] = login;
}

+(NSString *)loginForProviderName:(NSString *)providerName {
    return __keychain[providerName];
}

+(void)setProviderName:(NSString *)providerName {
    __keychain[@"providerName"] = providerName;
}

+(NSString *)providerName {
    return __keychain[@"providerName"];
}

+(NSDictionary *)loginsForProvider {
    if (__keychain[@"providerName"] && __keychain[__keychain[@"providerName"]]) {
        return @{__keychain[@"providerName"] : __keychain[__keychain[@"providerName"]]};
    }
    return nil;
}

+(void)clearLogins {
    if (__keychain[@"providerName"]) {
        __keychain[__keychain[@"providerName"]] = nil;
        __keychain[@"providerName"] = nil;
    }
}
@end
