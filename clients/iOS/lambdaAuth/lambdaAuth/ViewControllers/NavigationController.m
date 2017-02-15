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
#import "AWSAPIClientsManager.h"

@interface NavigationController ()

@end

@implementation NavigationController

-(void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

-(void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(authLost:) name:kAuthLostNotification object:nil];
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

#pragma mark - state change methods

- (void)resetState {
    if ([[self.topViewController class] isEqual:[LoginViewController class]] ||
        [[self.topViewController class] isEqual:[SignupViewController class]]) {
        return;
    }
    UIStoryboard *mainStoryBoard = [UIStoryboard storyboardWithName:@"Main" bundle:nil];
    [self setViewControllers:@[[mainStoryBoard instantiateViewControllerWithIdentifier:@"LoginViewController"]] animated:YES];
}

#pragma mark - NSNotification methods

-(void)authLost:(NSNotification *)notification {
    [self resetState];
}
@end
