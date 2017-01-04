//
//  DeveloperAuthenticatedIdentityProvider.h
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <AWSCore/AWSCore.h>

@interface DeveloperAuthenticatedIdentityProvider : AWSCognitoCredentialsProviderHelper
-(instancetype)initWithRegionType:(AWSRegionType)regionType
                   identityPoolId:(NSString *)identityPoolId
                  useEnhancedFlow:(BOOL)useEnhancedFlow
          identityProviderManager:(id<AWSIdentityProviderManager>)identityProviderManager
                       identityID:(NSString *)identityID
                            token:(NSString *)token;

@end
