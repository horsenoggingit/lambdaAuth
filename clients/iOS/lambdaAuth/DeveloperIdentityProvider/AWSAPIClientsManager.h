//
//  AWSAPIClientsManager.h
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <AWSCore/AWSCore.h>
#import "MYPREFIXAuthClient.h"

FOUNDATION_EXPORT NSString *const kAuthGainedNotification;
FOUNDATION_EXPORT NSString *const kAuthLostNotification;

FOUNDATION_EXPORT NSString * const kResponceErrorAction;
FOUNDATION_EXPORT NSString * const vResponceErrorActionHalt;
FOUNDATION_EXPORT NSString * const vResponceErrorActionGainAuth;

FOUNDATION_EXPORT NSString * const kResponceAPIError;
FOUNDATION_EXPORT NSString * const kResponceError;


@interface AWSAPIClientsManager : NSObject

+(MYPREFIXAuthClient *)unauthedClient;
+(MYPREFIXAuthClient *)authedClient;
+(void)setAuthedClientWithIdentityId:(NSString *)identityID token:(NSString *)token error:(NSError **)error;
+(NSString *)deviceId;
+(void)invalidateAuth;
+(void)logout;
+(BOOL)isAuthenticated;
+(void)setAuthedClient;
+(NSDictionary *)handleResponseError:(NSError *)error;

@end
