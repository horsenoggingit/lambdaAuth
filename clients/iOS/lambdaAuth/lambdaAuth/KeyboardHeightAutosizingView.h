//
//  KeyboardHeightAutosizingView.h
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface KeyboardHeightAutosizingView : UIView

@property (nonatomic, strong) IBOutletCollection(UIView) NSArray *resizeViews;
@property (nonatomic) NSUInteger minViewHeight;

@end
