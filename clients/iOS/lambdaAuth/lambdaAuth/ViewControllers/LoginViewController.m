//
//  LoginViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "LoginViewController.h"
#import "AWSAPIClientsManager.h"

@interface LoginViewController ()

@property (strong, nonatomic) IBOutlet UITextField *passwordTextField;
@property (strong, nonatomic) IBOutlet UITextField *emailTextField;

@end

@implementation LoginViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

/*
#pragma mark - Navigation

// In a storyboard-based application, you will often want to do a little preparation before navigation
- (void)prepareForSegue:(UIStoryboardSegue *)segue sender:(id)sender {
    // Get the new view controller using [segue destinationViewController].
    // Pass the selected object to the new view controller.
}
*/
- (IBAction)loginAction:(id)sender {
    
    MYPREFIXLoginRequest *loginRequest = [MYPREFIXLoginRequest new];
    loginRequest.email = _emailTextField.text;
    loginRequest.password = _passwordTextField.text;
    AWSTask *loginTask = [[AWSAPIClientsManager unauthedClient] loginPost:loginRequest];
    [loginTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            NSLog(@"got something");
            
            if (task.error) {
                if (task.error.userInfo[@"HTTPBody"]) {
                    NSError *error;
                    MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                    NSLog(@"%@", myError.description);
                } else {
                    NSLog(@"%@", task.error.description);
                }
                return;
            }
            MYPREFIXCredentials *credentials = task.result;
            NSError *error;
            [AWSAPIClientsManager setIdentityId:credentials.identityId token:credentials.token error:&error];
            if (error) {
                NSLog(@"%@", error.description);
                return;
            }
            [self performSegueWithIdentifier:@"LoginToFrontPageSegue" sender:self];
        });
        
      return nil;
    }];
}

@end
