//
//  NavigationController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "NavigationController.h"
#import "LoginViewController.h"
#import "SignupViewController.h"

@interface NavigationController ()

@end

@implementation NavigationController

- (void)resetState {
    if ([[self.topViewController class] isEqual:[LoginViewController class]] ||
        [[self.topViewController class] isEqual:[SignupViewController class]]) {
        return;
    }
    UIStoryboard *mainStoryBoard = [UIStoryboard storyboardWithName:@"Main" bundle:nil];
    [self setViewControllers:@[[mainStoryBoard instantiateViewControllerWithIdentifier:@"LoginViewController"]] animated:YES];
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}


@end
