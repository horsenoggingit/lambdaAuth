//
//  FormViewController.h
//  lambdaAuth
//
//  Created by James Infusino on 1/5/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface FormViewController : UIViewController

@property (strong, nonatomic) IBOutlet UIScrollView *contentScrollview;
@property (nonatomic) NSDictionary <NSNumber *, UIView *>*viewsForInput;
@property (nonatomic) NSArray <NSNumber *> *inputOrder;
@property (nonatomic) NSDictionary <NSNumber *, BOOL (^)()> *validationForInput;

- (BOOL)validateAllInputs;
- (void)validateForNextInputFieldOf:(UIView *)inputField finishedBlock:(void(^)())finishedBlock;

@end
