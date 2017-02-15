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


NSString * const kAuthGainedNotification = @"kAuthGainedNotification";
NSString * const kAuthLostNotification = @"kAuthLostNotification";

NSString * const kResponceErrorAction = @"action";
NSString * const vResponceErrorActionHalt = @"haltFutureOperations";
NSString * const vResponceErrorActionGainAuth = @"gainAuth";

NSString * const kResponceAPIError = @"apiError";
NSString * const kResponceError = @"error";


#define AWSAPIClientsManagerDomanin @"AWSAPIClientsManagerDomanin"
@protocol SessionProtocol <NSObject>
-(NSURLSession *) session;
@end

@implementation AWSAPIClientsManager

AWSRegionType __AWSRegionType;
UICKeyChainStore  *__keychain;

MYPREFIXAuthClient *__apiUnAuthInstance;
MYPREFIXAuthClient<SessionProtocol> *__apiAuthInstance;

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

    __apiAuthInstance = (MYPREFIXAuthClient<SessionProtocol> *)[MYPREFIXAuthClient clientForKey:@"authClient"];


    // get the user to obtain logins
    AWSTask *meGetTask = [__apiAuthInstance userMeGet];
    [meGetTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{

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
    [[NSNotificationCenter defaultCenter] postNotificationName:kAuthGainedNotification object:nil];
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
    if (__apiAuthInstance) {
        [[__apiAuthInstance session] getTasksWithCompletionHandler:^(NSArray<NSURLSessionDataTask *> * _Nonnull dataTasks, NSArray<NSURLSessionUploadTask *> * _Nonnull uploadTasks, NSArray<NSURLSessionDownloadTask *> * _Nonnull downloadTasks) {
            [dataTasks enumerateObjectsUsingBlock:^(NSURLSessionDataTask * _Nonnull obj, NSUInteger idx, BOOL * _Nonnull stop) {
                [obj cancel];
            }];
            [uploadTasks enumerateObjectsUsingBlock:^(NSURLSessionUploadTask * _Nonnull obj, NSUInteger idx, BOOL * _Nonnull stop) {
                [obj cancel];
            }];
            [downloadTasks enumerateObjectsUsingBlock:^(NSURLSessionDownloadTask * _Nonnull obj, NSUInteger idx, BOOL * _Nonnull stop) {
                [obj cancel];
            }];
        }];
    }
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

+(NSDictionary *)handleResponseError:(NSError *)error {

    if (!error) {
        return nil;
    }
    MYPREFIXError *myError;
    if (error.userInfo[@"HTTPBody"]) {
        NSLog(@"Deceived error with HTTPBODY");
        myError = [MYPREFIXError modelWithDictionary:error.userInfo[@"HTTPBody"] error:nil];
    }
    
    if (myError && myError.type) {
        NSLog(@"%@, %@",myError.type, myError.description);
        // things we can do here are defined by the applicaitons error message, perhaps.
        // TODO: check to see what a crash in lambda looks like.
        // TODO: check to see what appens when the auth is incorrect
        
        // if the object is valid we can get responses:
        //  httpStatus: 400, errorType: "BadRequest" (Validation error)
        //  httpStatus: 404, errorType: "NotFound" (the request URL does not exist)
        //  httpStatus: 405, errorType: "MethodNotAllowed", e.g. tried to PUT a GET
        //  httpStatus: 401, errorType: "Unauthorized", e.g. login failed
        //  httpStatus: 409, errorType: "Conflict", e.g. signing up with an existing email
        //  httpStatus: 500, errorType: "InternalServerError", backend had an unfixable error
        
        // requests can return Unauthorized if the token fails or if logins do not match. This can happen at token
        // renewal.
        if ([myError.type isEqual:@"Unauthorized"]) {
            [AWSAPIClientsManager logout];
            [[NSNotificationCenter defaultCenter] postNotificationName:kAuthLostNotification object:nil];
            return @{kResponceAPIError: myError, kResponceErrorAction: vResponceErrorActionGainAuth};
        }
        return @{kResponceAPIError: myError};
    } else {
        // here is more critical...
        // NSURLErrorDomain
        // code = -1200 ssl connection cannot be made
        // code = -1009 internet connection offline
        // code = -1003 server with specified host name could not be found
        // code= -999 "cancelled" <- this one is generated when we terminate a session or logout
        
        NSLog(@"%@", error.description);
        if (error.code == -999) {
            return @{kResponceError: error, kResponceErrorAction: vResponceErrorActionHalt};
        }
        return @{kResponceError: error};
    }

    return nil;

}
@end
