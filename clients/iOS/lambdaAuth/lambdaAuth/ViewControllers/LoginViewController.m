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

@interface LoginViewController ()

@property (strong, nonatomic) IBOutlet UITextField *passwordTextField;
@property (strong, nonatomic) IBOutlet UITextField *emailTextField;
@property (strong, nonatomic) IBOutlet UIScrollView *contentScrollView;
@property (strong, nonatomic) IBOutlet UIButton *loginButton;

@end

@implementation LoginViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
    _passwordTextField.delegate = self;
    _emailTextField.delegate = self;
    
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
#pragma mark - Chrome

-(void)blushView:(UIView *)shakeView {
    UIColor *originalBackgroundColor = shakeView.backgroundColor;
    [UIView animateWithDuration:0.3 animations:^{
        shakeView.backgroundColor = [UIColor redColor];
    } completion:^(BOOL finished) {
        [UIView animateWithDuration:0.3 animations:^{
            shakeView.backgroundColor = originalBackgroundColor;
        }];
    }];
}



#pragma mark - Input Validation

- (BOOL)areInputsValid {
    LKEmailValidator *validator = [LKEmailValidator validator];
    NSError *error = nil;
    BOOL isEmailValid = [validator validate:_emailTextField.text error:&error];
    if (!isEmailValid) {
        [self blushView:_emailTextField];
        [_emailTextField becomeFirstResponder];
        return NO;
    }
    if (_passwordTextField.text.length < 1) {
        [self blushView:_passwordTextField];
        [_passwordTextField becomeFirstResponder];
        return NO;
    }
    return YES;
}

#pragma mark - IBActions

- (IBAction)loginAction:(UIButton *)sender {
    if (![self areInputsValid]) {
        return;
    }
    
    sender.enabled = NO;
    
    MYPREFIXLoginRequest *loginRequest = [MYPREFIXLoginRequest new];
    loginRequest.email = _emailTextField.text;
    loginRequest.password = _passwordTextField.text;
    AWSTask *loginTask = [[AWSAPIClientsManager unauthedClient] loginPost:loginRequest];
    [loginTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (task.error) {
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
            [AWSAPIClientsManager setIdentityId:credentials.identityId token:credentials.token error:&error];
            if (error) {
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
    if ([self areInputsValid]) {
        if (textField == _emailTextField) {
            [_passwordTextField becomeFirstResponder];
        } else if (textField == _passwordTextField) {
            [self loginAction:_loginButton];
        }
    }
    return NO;
}

@end
