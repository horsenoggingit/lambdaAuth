//
//  FormViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/5/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "FormViewController.h"
#import "UIView+ProjectFormBehaviors.h"

@interface FormViewController ()

@end

@implementation FormViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

#pragma mark - Input Validation

- (NSNumber *)firstInvalidInput {
    for (NSInteger index = 0; index < _inputOrder.count; index++) {
        if (!_validationForInput[_inputOrder[index]]()) {
            return _inputOrder[index];
        }
    }
    return nil;
}

- (BOOL)validateAllInputs {
    NSNumber *invalidInput = [self firstInvalidInput];
    if (invalidInput) {
        [self.viewsForInput[invalidInput] blushView];
        if ([self.viewsForInput[invalidInput] canBecomeFirstResponder]) {
            [self.viewsForInput[invalidInput] becomeFirstResponder];
        } else {
            [self.contentScrollview scrollRectToVisible:[self.contentScrollview convertRect:self.viewsForInput[invalidInput].bounds fromView:self.viewsForInput[invalidInput]] animated:YES];
        }
        return NO;
    }
    return YES;
}

- (void)validateForNextInputFieldOf:(UIView *)inputField finishedBlock:(void(^)())finishedBlock {
    NSNumber *invalidInput = [self firstInvalidInput];
    [_inputOrder enumerateObjectsUsingBlock:^(NSNumber * _Nonnull obj, NSUInteger idx, BOOL * _Nonnull stop) {
        if (inputField == _viewsForInput[obj]) {
            if (invalidInput && invalidInput.integerValue <= _inputOrder[idx].integerValue) {
                [_viewsForInput[invalidInput] blushView];
                if ([_viewsForInput[invalidInput] canBecomeFirstResponder]) {
                    [_viewsForInput[invalidInput] becomeFirstResponder];
                } else {
                    [inputField resignFirstResponder];
                    [_contentScrollview scrollRectToVisible:[_contentScrollview convertRect:_viewsForInput[invalidInput].bounds fromView:_viewsForInput[invalidInput]] animated:YES];
                }
            } else {
                [inputField resignFirstResponder];
                if (idx+1 >= _inputOrder.count) {
                    // we are done here! everthing is good to go.
                    finishedBlock();
                } else {
                    if ([_viewsForInput[_inputOrder[idx+1]] canBecomeFirstResponder]) {
                        [_viewsForInput[_inputOrder[idx+1]] becomeFirstResponder];
                    } else {
                        [_contentScrollview scrollRectToVisible:[_contentScrollview convertRect:_viewsForInput[_inputOrder[idx+1]].bounds fromView:_viewsForInput[_inputOrder[idx+1]]] animated:YES];
                    }
                }
            }
            *stop = YES;
        }
    }];
}

@end
