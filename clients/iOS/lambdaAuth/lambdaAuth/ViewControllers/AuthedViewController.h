//
//  AuthedViewController.h
//  lambdaAuth
//
//  Created by James Infusino on 2/14/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface AuthedViewController : UIViewController

- (BOOL)shouldContinueTakeActionsForResopnseError:(NSError *)error;

@end
