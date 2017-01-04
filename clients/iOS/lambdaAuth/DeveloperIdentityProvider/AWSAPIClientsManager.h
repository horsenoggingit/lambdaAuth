//
//  AWSAPIClientsManager.h
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <AWSCore/AWSCore.h>
#import "MYPREFIXIostestSwaggerAuthClient.h"

@interface AWSAPIClientsManager : NSObject

+(MYPREFIXIostestSwaggerAuthClient *)unauthedClient;
+(MYPREFIXIostestSwaggerAuthClient *)authedClient;
+(void)setIdentityId:(NSString *)identityID token:(NSString *)token error:(NSError **)error;

@end
