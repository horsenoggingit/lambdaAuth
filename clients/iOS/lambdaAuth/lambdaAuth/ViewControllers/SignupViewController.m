//
//  SignupViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "SignupViewController.h"
#import "AWSAPIClientsManager.h"
#import "LKValidators.h"
#import "UIView+ProjectFormBehaviors.h"

typedef NS_ENUM(NSInteger, SignupInput) {
    SignupInputNotDefined,
    SignupInputEmail,
    SignupInputName,
    SignupInputDOB,
    SignupInputPassword
};

@interface SignupViewController ()

@property (strong, nonatomic) IBOutlet UITextField *emailTextField;
@property (strong, nonatomic) IBOutlet UITextField *nameTextField;
@property (strong, nonatomic) IBOutlet UITextField *passwordTextField;
@property (strong, nonatomic) IBOutlet UIButton *signupButton;
@property (strong, nonatomic) IBOutlet UIDatePicker *dobDatePicker;
@property (nonatomic) BOOL dobUpdated;

@end

@implementation SignupViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
    self.viewsForInput = @{@(SignupInputEmail) : _emailTextField,
      @(SignupInputName) : _nameTextField,
      @(SignupInputDOB) : _dobDatePicker,
      @(SignupInputPassword) : _passwordTextField};
    self.inputOrder = @[@(SignupInputEmail), @(SignupInputName), @(SignupInputDOB), @(SignupInputPassword)];
    self.validationForInput = @{
                                  @(SignupInputEmail): ^BOOL(){
                                      LKEmailValidator *emailValidator = [LKEmailValidator validator];
                                      NSError *error = nil;
                                      BOOL isEmailValid = [emailValidator validate:_emailTextField.text error:&error];
                                      if (!isEmailValid) {
                                          return NO;
                                      }
                                      return YES;
                                  },
                                  @(SignupInputName): ^BOOL(){
                                      LKLengthValidator *nameValidator = [LKLengthValidator validator];
                                      nameValidator.length = 1;
                                      NSError *error = nil;
                                      BOOL isNameValid = [nameValidator validate:_nameTextField.text error:&error];
                                      if (!isNameValid) {
                                          return NO;
                                      }
                                      return YES;
                                  },
                                  @(SignupInputDOB): ^BOOL(){
                                      if (!_dobUpdated) {
                                          return NO;
                                      }
                                      return YES;
                                  },
                                  @(SignupInputPassword): ^BOOL(){
                                      if (_passwordTextField.text.length < 1) {
                                          return NO;
                                      }
                                      return YES;

                                  }
                                };

    _emailTextField.delegate = self;
    _nameTextField.delegate = self;
    _passwordTextField.delegate = self;
    [_dobDatePicker  addTarget:self action:@selector(dateChangedAction:) forControlEvents:UIControlEventValueChanged];
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

- (IBAction)signupAction:(UIButton *)sender {

    if (![self validateAllInputs]) {
        return;
    }

    sender.enabled = NO;

    MYPREFIXSignupRequest *signupRequest = [MYPREFIXSignupRequest new];
    signupRequest.email = _emailTextField.text;
    signupRequest.name = _nameTextField.text;
    signupRequest.password = _passwordTextField.text;
    signupRequest.dob = @(_dobDatePicker.date.timeIntervalSince1970);
    signupRequest.deviceId = [AWSAPIClientsManager deviceId];
    AWSTask *signupTask = [[AWSAPIClientsManager unauthedClient] signupPost:signupRequest];
    [signupTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (task.error) {
                [_signupButton shakeView];
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
                [_signupButton shakeView];
                NSLog(@"%@", error.description);
                sender.enabled = YES;
                return;
            }
            [self performSegueWithIdentifier:@"SignupToFrontPageSegue" sender:self];
        });

        return nil;
    }];
}
#pragma mark - Target-Action pattern methods

- (void)dateChangedAction:(UIDatePicker *)sender {
    _dobUpdated = YES;
}

- (IBAction)tapGestureRecognized:(UITapGestureRecognizer *)sender {
    // lower the keyboard if the user taps outside first responders
    [_emailTextField resignFirstResponder];
    [_nameTextField resignFirstResponder];
    [_passwordTextField resignFirstResponder];
}

#pragma mark - TextFieldDelegate methods


- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    [self validateForNextInputFieldOf:textField finishedBlock:^{
        [self signupAction:_signupButton];
        [self.contentScrollview scrollRectToVisible:[self.contentScrollview convertRect:_signupButton.bounds fromView:_signupButton] animated:YES];
    }];
    return NO;
}


@end
