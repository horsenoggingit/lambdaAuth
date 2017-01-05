//
//  KeyboardHeightAutosizingView.m
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "KeyboardHeightAutosizingView.h"
#import "KeyboardStateManager.h"

@interface KeyboardHeightAutosizingView ()

@property NSMutableDictionary *resizeData;

@end

@implementation KeyboardHeightAutosizingView

#pragma mark - initialization
// TODO: I have not handled the case the keyboard is already present when this view is created.
// Perhaps add a method to log a warning when this view is added to a view heigherarchy and the keyboard
// is already visible.

-(void)commonInitKeyboardHeightAutosizingView {
    [[NSNotificationCenter defaultCenter]addObserver:self selector:@selector(onKeyboardShow:) name:UIKeyboardWillShowNotification object:nil];
    [[NSNotificationCenter defaultCenter]addObserver:self selector:@selector(onKeyboardHide:) name:UIKeyboardWillHideNotification object:nil];
    [[NSNotificationCenter defaultCenter]addObserver:self selector:@selector(onKeyboardChange:) name:UIKeyboardWillChangeFrameNotification object:nil];
    _resizeViews = @[];
    _resizeData = [@{} mutableCopy];
    _minViewHeight = 50;
}

-(instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self commonInitKeyboardHeightAutosizingView];
    }
    return self;
}

-(instancetype)initWithCoder:(NSCoder *)aDecoder {
    self = [super initWithCoder:aDecoder];
    if (self) {
        [self commonInitKeyboardHeightAutosizingView];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

#pragma mark - setters and getters

-(void)setResizeViews:(NSArray *)resizeViews {
    _resizeViews = [resizeViews copy];
    _resizeData = [@{} mutableCopy];
}

#pragma mark - keyboard presence methods

- (void)updateFramesWithNotification:(NSNotification *)notification updateResizeData:(BOOL)updateResizeData {
    if (notification && notification.userInfo) {
        NSValue *endFrameValue = notification.userInfo[UIKeyboardFrameEndUserInfoKey];
        NSNumber *animationCurveNumber = notification.userInfo[UIKeyboardAnimationCurveUserInfoKey];
        NSNumber *animationDurationNumber = notification.userInfo[UIKeyboardAnimationDurationUserInfoKey];
        if (endFrameValue) {
            CGRect endFrameLocal = [self convertRect:endFrameValue.CGRectValue fromView:nil];
            [_resizeViews enumerateObjectsUsingBlock:^(UIView * _Nonnull obj, NSUInteger idx, BOOL * _Nonnull stop) {
                CGRect origianlFrame = obj.frame;
                if (endFrameLocal.origin.y - origianlFrame.origin.y > 0) {
                    if (updateResizeData && ![KeyboardStateManager isKeyboardShown]) {
                        _resizeData[@(idx)] = @{ @"originalHeight" : @(obj.frame.size.height)};
                    }
                    CGRect newFrame = origianlFrame;
                    newFrame.size.height = MAX(endFrameLocal.origin.y - origianlFrame.origin.y, _minViewHeight);
                    
                    // can specify an entire animation
                    if (animationCurveNumber && animationDurationNumber) {
                        [UIView animateWithDuration:animationDurationNumber.doubleValue delay:0 options:(animationCurveNumber.integerValue << 16) animations:^{
                            obj.frame = newFrame;
                        } completion:^(BOOL finished) {
                            
                        }];
                    } else {
                        obj.frame = newFrame;
                    }
                }
            }];
            
        } else {
            // nothing to do.
        }
    }
}

#pragma mark - notification handlers

-(void)onKeyboardShow:(NSNotification *)notification {
    [self updateFramesWithNotification:notification updateResizeData:YES];
}

-(void)onKeyboardHide:(NSNotification *)notification {
    // just reset anything we've done before
    NSNumber *animationCurveNumber = notification.userInfo[UIKeyboardAnimationCurveUserInfoKey];
    NSNumber *animationDurationNumber = notification.userInfo[UIKeyboardAnimationDurationUserInfoKey];

    [_resizeViews enumerateObjectsUsingBlock:^(UIView * _Nonnull obj, NSUInteger idx, BOOL * _Nonnull stop) {
        CGRect modifiedFrame = obj.frame;
        if (_resizeData[@(idx)]) {
            NSNumber *originalHeightNumber = _resizeData[@(idx)][@"originalHeight"];
            CGRect originalFrame = modifiedFrame;
            originalFrame.size.height = originalHeightNumber.doubleValue;
            if (animationCurveNumber && animationCurveNumber) {
                [UIView animateWithDuration:animationDurationNumber.doubleValue delay:0 options:(animationCurveNumber.integerValue << 16) animations:^{
                    obj.frame = originalFrame;
                    [obj setNeedsLayout];
                    [obj layoutIfNeeded];
                } completion:^(BOOL finished) {
                    
                }];
            } else {
                obj.frame = originalFrame;
            }
        }
    }];
}

-(void)onKeyboardChange:(NSNotification *)notification {
    if ([KeyboardStateManager isKeyboardShown]) {
        [self updateFramesWithNotification:notification updateResizeData:NO];
    }
}

@end
