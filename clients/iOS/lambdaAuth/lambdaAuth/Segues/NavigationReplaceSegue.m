//
//  NavigationReplaceSegue.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "NavigationReplaceSegue.h"

@implementation NavigationReplaceSegue
- (void)perform {
    [self destinationViewController].navigationItem.hidesBackButton = YES;
    [[[self sourceViewController] navigationController] setViewControllers:@[[self destinationViewController]] animated:YES];
}
@end
