//
//  LoginViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "LoginViewController.h"
#import "AWSAPIClientsManager.h"
#import "LKValidators.h"
#import "UIView+ProjectFormBehaviors.h"

typedef NS_ENUM(NSInteger, LoginInput) {
    LoginInputNotDefined,
    LoginInputEmail,
    LoginInputPassword
};

@interface LoginViewController ()

@property (strong, nonatomic) IBOutlet UITextField *passwordTextField;
@property (strong, nonatomic) IBOutlet UITextField *emailTextField;
@property (strong, nonatomic) IBOutlet UIButton *loginButton;

@end

@implementation LoginViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
    _passwordTextField.delegate = self;
    _emailTextField.delegate = self;
    
    self.viewsForInput = @{@(LoginInputEmail) : _emailTextField,
                                 @(LoginInputPassword) : _passwordTextField};
    self.inputOrder = @[@(LoginInputEmail), @(LoginInputPassword)];
    self.validationForInput = @{
                                      @(LoginInputEmail): ^BOOL(){
                                          LKEmailValidator *emailValidator = [LKEmailValidator validator];
                                          NSError *error = nil;
                                          BOOL isEmailValid = [emailValidator validate:_emailTextField.text error:&error];
                                          if (!isEmailValid) {
                                              return NO;
                                          }
                                          return YES;
                                      },
                                      @(LoginInputPassword): ^BOOL(){
                                          if (_passwordTextField.text.length < 1) {
                                              return NO;
                                          }
                                          return YES;
                                      }
                                    };
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


#pragma mark - IBActions

- (IBAction)loginAction:(UIButton *)sender {
    if (![self validateAllInputs]) {
        return;
    }
    
    sender.enabled = NO;
    
    MYPREFIXLoginRequest *loginRequest = [MYPREFIXLoginRequest new];
    loginRequest.email = _emailTextField.text;
    loginRequest.password = _passwordTextField.text;
    loginRequest.deviceId = [AWSAPIClientsManager deviceId];
    AWSTask *loginTask = [[AWSAPIClientsManager unauthedClient] loginPost:loginRequest];
    [loginTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (task.error) {
                [_loginButton shakeView];
                if (task.error.userInfo[@"HTTPBody"]) {
                    NSError *error;
                    // should have a common error handling utility.
                    MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                    NSLog(@"%@", myError.description);
                } else {
                    NSLog(@"%@", task.error.description);
                }
                sender.enabled = YES;
                return;
            }
            MYPREFIXCredentials *credentials = task.result;
            NSError *error;
            [AWSAPIClientsManager setAuthedClientWithIdentityId:credentials.identityId token:credentials.token error:&error];
            if (error) {
                [_loginButton shakeView];
                NSLog(@"%@", error.description);
                sender.enabled = YES;
                return;
            }
            [self performSegueWithIdentifier:@"LoginToFrontPageSegue" sender:self];
        });
      return nil;
    }];
}

#pragma mark - TextFieldDelegate methods

- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    [self validateForNextInputFieldOf:textField finishedBlock:^{
        [self loginAction:_loginButton];
        [self.contentScrollview scrollRectToVisible:[self.contentScrollview convertRect:_loginButton.bounds fromView:_loginButton] animated:YES];
    }];
    return NO;
}

@end
