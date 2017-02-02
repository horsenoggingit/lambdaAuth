//
//  KeyboardHeightAutosizingView.h
//  lambdaAuth
//
//  Created by James Infusino on 1/3/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface KeyboardHeightAutosizingView : UIView
// Subviews in this colleciton will have their height modified if their frame overlaps with
// the keyboard.
@property (nonatomic, strong) IBOutletCollection(UIView) NSArray *resizeViews;

// View layouts may be broken if keyboard presentation results in degenerate views.
// use this property to set a minimum size.
@property (nonatomic) NSUInteger minViewHeight;

@end
