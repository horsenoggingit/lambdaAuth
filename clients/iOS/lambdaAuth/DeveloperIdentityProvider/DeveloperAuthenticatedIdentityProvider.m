//
//  DeveloperAuthenticatedIdentityProvider.m
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "DeveloperAuthenticatedIdentityProvider.h"

@interface DeveloperAuthenticatedIdentityProvider ()
@property (nonatomic) NSString *developerToken;
@end

@implementation DeveloperAuthenticatedIdentityProvider

-(instancetype)initWithRegionType:(AWSRegionType)regionType
                   identityPoolId:(NSString *)identityPoolId
                  useEnhancedFlow:(BOOL)useEnhancedFlow
          identityProviderManager:(id<AWSIdentityProviderManager>)identityProviderManager
                       identityID:(NSString *)identityID
                            token:(NSString *)token {
    self = [super initWithRegionType:regionType identityPoolId:identityPoolId useEnhancedFlow:useEnhancedFlow identityProviderManager:identityProviderManager];
    if (self) {
        self.identityId = identityID;
        _developerToken = token;
    }
    return self;
}

- (AWSTask <NSString*> *) token {
    return [AWSTask taskWithResult:_developerToken];
}

@end
