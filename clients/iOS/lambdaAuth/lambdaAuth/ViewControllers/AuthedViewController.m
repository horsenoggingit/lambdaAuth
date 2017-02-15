//
//  AuthedViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 2/14/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "AuthedViewController.h"
#import "AWSAPIClientsManager.h"
#import "NavigationController.h"

@interface AuthedViewController ()

@end

@implementation AuthedViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}


- (BOOL)shouldContinueTakeActionsForResopnseError:(NSError *)error {
    
    NSDictionary *responseError = [AWSAPIClientsManager handleResponseError:error];
    if ([responseError[kResponceErrorAction] isEqualToString:vResponceErrorActionHalt]) {
        return NO;
    }
    
    if ([responseError[kResponceErrorAction] isEqualToString:vResponceErrorActionGainAuth]) {
        return NO;
    }
    return YES;
}

/*
#pragma mark - Navigation

// In a storyboard-based application, you will often want to do a little preparation before navigation
- (void)prepareForSegue:(UIStoryboardSegue *)segue sender:(id)sender {
    // Get the new view controller using [segue destinationViewController].
    // Pass the selected object to the new view controller.
}
*/

@end
