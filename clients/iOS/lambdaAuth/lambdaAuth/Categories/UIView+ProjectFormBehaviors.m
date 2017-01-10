//
//  UIView+ProjectFormBehaviors.m
//  lambdaAuth
//
//  Created by James Infusino on 1/5/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "UIView+ProjectFormBehaviors.h"

@implementation UIView (ProjectFormBehaviors)

-(void)blushView {
    UIColor *originalBackgroundColor = self.backgroundColor;
    [UIView animateWithDuration:0.3 animations:^{
        self.backgroundColor = [UIColor redColor];
    } completion:^(BOOL finished) {
        [UIView animateWithDuration:0.3 animations:^{
            self.backgroundColor = originalBackgroundColor;
        }];
    }];
}

-(void)shakeView {
    static CAKeyframeAnimation *animation;
    if (!animation) {
        NSArray <NSNumber*> *shakeArray  =@[@0, @20, @-20, @20, @-20,@20, @-20,@20, @-20,@20, @0];
        CGMutablePathRef path = CGPathCreateMutable();
        CGPathMoveToPoint(path, NULL, shakeArray[0].doubleValue, 0);
        for (NSInteger index = 1; index < shakeArray.count; index ++) {
            CGPathAddLineToPoint(path, NULL, shakeArray[index].doubleValue, 0);
        }
        animation = [CAKeyframeAnimation animationWithKeyPath:@"position"];
        animation.path = path;
        animation.additive = YES;
        CGPathRelease(path);
        animation.duration = 0.5;
    }
    // animations are copied so it is fine to use a static here.
    [self.layer addAnimation:animation forKey:@"ShakeAnimation"];
}

@end
