//
//  RootViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/10/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "RootViewController.h"
#import "AWSAPIClientsManager.h"

@interface RootViewController ()

@end

@implementation RootViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

-(void)viewDidAppear:(BOOL)animated {
    // check if we have auth. if so segue to front page, if not go to login.
    if ([AWSAPIClientsManager isAuthenticated]) {
        [AWSAPIClientsManager setAuthedClient];
        [self performSegueWithIdentifier:@"RootToFrontPageSegue" sender:self];
    } else {
        [self performSegueWithIdentifier:@"RootToSignupSegue" sender:self];
    }
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
