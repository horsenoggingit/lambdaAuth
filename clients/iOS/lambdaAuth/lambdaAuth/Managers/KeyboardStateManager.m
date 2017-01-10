//
//  KeyboardStateManager.m
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "KeyboardStateManager.h"
#import <UIKit/UIKit.h>

@implementation KeyboardStateManager

BOOL __keyboardShown = NO;

+ (void)initialize {
    if (self == [KeyboardStateManager class]) {
        static dispatch_once_t onceToken;
        
        dispatch_once(&onceToken, ^{
            [[NSNotificationCenter defaultCenter]addObserver:self selector:@selector(onKeyboardShow:) name:UIKeyboardWillShowNotification object:nil];
            [[NSNotificationCenter defaultCenter]addObserver:self selector:@selector(onKeyboardHide:) name:UIKeyboardWillHideNotification object:nil];
        });
    }
}

+(void)onKeyboardShow:(NSNotification *)notification {
    __keyboardShown = YES;
}

+(void)onKeyboardHide:(NSNotification *)notification {
    __keyboardShown = NO;
}

+(BOOL)isKeyboardShown {
    return __keyboardShown;
}

@end
