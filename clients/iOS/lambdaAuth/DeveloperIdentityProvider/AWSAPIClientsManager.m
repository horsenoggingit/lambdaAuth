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

MYPREFIXIostestSwaggerAuthClient *__apiUnAuthInstance;
MYPREFIXIostestSwaggerAuthClient *__apiAuthInstance;

+(MYPREFIXIostestSwaggerAuthClient *)unauthedClient {
    if (!__apiUnAuthInstance) {
        
        AWSServiceConfiguration *configuration = [[AWSServiceConfiguration alloc] initWithRegion:AWSRegionUnknown
                                                                             credentialsProvider:nil];
       
        [MYPREFIXIostestSwaggerAuthClient registerClientWithConfiguration:configuration forKey:@"unAuthClient"];
       
        __apiUnAuthInstance = [MYPREFIXIostestSwaggerAuthClient clientForKey:@"unAuthClient"];
    }
    return __apiUnAuthInstance;
}

+ (void)setIdentityId:(NSString *)identityID token:(NSString *)token error:(NSError **)error {
    __token = token;
    __identityId = identityID;
    NSArray *identityIDComponents = [__identityId componentsSeparatedByString:@":"];
    if (identityIDComponents.count < 2) {
        if (error) {
            *error = [[NSError alloc] initWithDomain:AWSAPIClientsManagerDomanin code:0 userInfo:@{NSLocalizedDescriptionKey : @"invalid IdentityId"}];
        }
        return;
    }
    __poolRegionString = identityIDComponents[0];
    __AWSRegionType = [__poolRegionString aws_regionTypeValue];
    
    DeveloperAuthenticatedIdentityProvider * devAuth = [[DeveloperAuthenticatedIdentityProvider alloc] initWithRegionType:__AWSRegionType
                                                                                                           identityPoolId:@""
                                                                                                          useEnhancedFlow:YES
                                                                                                  identityProviderManager:nil
                                                                                                               identityID:__identityId
                                                                                                                    token:__token];

    AWSCognitoCredentialsProvider *credentialsProvider = [[AWSCognitoCredentialsProvider alloc]
                                                          initWithRegionType:__AWSRegionType
                                                          identityProvider:devAuth];
    AWSServiceConfiguration *configuration = [[AWSServiceConfiguration alloc] initWithRegion:__AWSRegionType
                                                                         credentialsProvider:credentialsProvider];
    
    [MYPREFIXIostestSwaggerAuthClient registerClientWithConfiguration:configuration forKey:@"authClient"];

    __apiAuthInstance = [MYPREFIXIostestSwaggerAuthClient clientForKey:@"authClient"];
}

+(MYPREFIXIostestSwaggerAuthClient *)authedClient {
    return __apiAuthInstance;
}

@end
