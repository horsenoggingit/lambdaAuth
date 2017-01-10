//
//  AWSAPIClientsManager.m
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "AWSAPIClientsManager.h"
#import "DeveloperAuthenticatedIdentityProvider.h"


#define AWSAPIClientsManagerDomanin @"AWSAPIClientsManagerDomanin"

@implementation AWSAPIClientsManager

NSString *__token, *__identityId, *__poolRegionString;
AWSRegionType __AWSRegionType;
NSDictionary *__AWSConstants;
NSMutableDictionary  *__keychain;

MYPREFIXIostestSwaggerAuthClient *__apiUnAuthInstance;
MYPREFIXIostestSwaggerAuthClient *__apiAuthInstance;

+(void)initialize {
    if (self == [AWSAPIClientsManager class]) {
        static dispatch_once_t onceToken;
        
        dispatch_once(&onceToken, ^{
            NSString *filePath = [[NSBundle mainBundle] pathForResource:@"AWSConstants" ofType:@"json"];
            NSString *jsonString = [[NSString alloc] initWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:NULL];
            NSError *jsonError;
            __AWSConstants = [NSJSONSerialization JSONObjectWithData:[jsonString dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingMutableContainers error:&jsonError];
            __keychain = [NSMutableDictionary new];
        });
    }

}

#pragma mark - client getters
+(MYPREFIXIostestSwaggerAuthClient *)unauthedClient {
    if (!__apiUnAuthInstance) {
        
        AWSServiceConfiguration *configuration = [[AWSServiceConfiguration alloc] initWithRegion:AWSRegionUnknown
                                                                             credentialsProvider:nil];
       
        [MYPREFIXIostestSwaggerAuthClient registerClientWithConfiguration:configuration forKey:@"unAuthClient"];
       
        __apiUnAuthInstance = [MYPREFIXIostestSwaggerAuthClient clientForKey:@"unAuthClient"];
    }
    return __apiUnAuthInstance;
}

+(MYPREFIXIostestSwaggerAuthClient *)authedClient {
    return __apiAuthInstance;
}

#pragma mark - auth configuration

+ (void)setAuthedClientWithIdentityId:(NSString *)identityID token:(NSString *)token error:(NSError **)error {
    [__keychain removeObjectForKey:@"logins"];
    NSArray *identityIDComponents = [identityID componentsSeparatedByString:@":"];
    if (identityIDComponents.count < 2) {
        if (error) {
            *error = [[NSError alloc] initWithDomain:AWSAPIClientsManagerDomanin code:0 userInfo:@{NSLocalizedDescriptionKey : @"invalid IdentityId"}];
        }
        return;
    }
    __poolRegionString = identityIDComponents[0];
    __AWSRegionType = [__poolRegionString aws_regionTypeValue];
    
    DeveloperAuthenticatedIdentityProvider * devAuth = [[DeveloperAuthenticatedIdentityProvider alloc] initWithRegionType:__AWSRegionType
                                                                                                           identityPoolId:__AWSConstants[@"COGNITO"][@"IDENTITY_POOL"][@"identityPoolId"]
                                                                                                          useEnhancedFlow:YES
                                                                                                  identityProviderManager:nil
                                                        devAuthenticationTaskBlock:^AWSTask *{
                                                            if (!__keychain[@"logins"]) {
                                                                DeveloperAuthenticationResponse *devAuthResponse = [DeveloperAuthenticationResponse new];
                                                                devAuthResponse.identityId = identityID;
                                                                devAuthResponse.token = token;
                                                                return [AWSTask taskWithResult:devAuthResponse];
                                                            }
                                                            
                                                            MYPREFIXTokenRequest *tokenRequest = [MYPREFIXTokenRequest new];
                                                            tokenRequest.providerName = __keychain[@"providerName"];
                                                            tokenRequest._id = __keychain[@"logins"][__keychain[@"providerName"]];
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
    [MYPREFIXIostestSwaggerAuthClient registerClientWithConfiguration:configuration forKey:@"authClient"];

    __apiAuthInstance = [MYPREFIXIostestSwaggerAuthClient clientForKey:@"authClient"];
    
    
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
            __keychain[@"logins"] = user.logins;
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
    [__keychain removeObjectForKey:@"logins"];
    __apiAuthInstance = nil;
    [MYPREFIXIostestSwaggerAuthClient removeClientForKey:@"authClient"];
}
@end
