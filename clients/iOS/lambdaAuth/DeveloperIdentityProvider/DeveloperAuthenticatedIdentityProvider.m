//
//  DeveloperAuthenticatedIdentityProvider.m
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "DeveloperAuthenticatedIdentityProvider.h"


@implementation DeveloperAuthenticationResponse
@end

@interface DeveloperAuthenticatedIdentityProvider ()
@property (nonatomic) NSString *developerToken;
@property (nonatomic) AWSTask * (^devAuthenticationTaskBlock)();
@end

@implementation DeveloperAuthenticatedIdentityProvider

-(instancetype)initWithRegionType:(AWSRegionType)regionType
                   identityPoolId:(NSString *)identityPoolId
                  useEnhancedFlow:(BOOL)useEnhancedFlow
          identityProviderManager:(id<AWSIdentityProviderManager>)identityProviderManager
           devAuthenticationTaskBlock:(AWSTask * (^)())devAuthenticationTaskBlock {
    self = [super initWithRegionType:regionType identityPoolId:identityPoolId useEnhancedFlow:useEnhancedFlow identityProviderManager:identityProviderManager];
    if (self) {
        _devAuthenticationTaskBlock = [devAuthenticationTaskBlock copy];
    }
    return self;
}

- (AWSTask <NSString*> *) token {
    AWSTask *devAuthenticationTask = _devAuthenticationTaskBlock();
    return [devAuthenticationTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        if (task.error) {
            // inform the client at we are unauthed.
            return [AWSTask taskWithError:task.error];
        }
        DeveloperAuthenticationResponse *result = devAuthenticationTask.result;
        self.identityId = result.identityId;
        _developerToken = result.token;
        return [AWSTask taskWithResult:result.token];
    }];
}

@end
