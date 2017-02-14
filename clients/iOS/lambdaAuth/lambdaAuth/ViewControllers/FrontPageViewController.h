//
//  FrontPageViewController.h
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <UIKit/UIKit.h>
#import "AuthedViewController.h"

@interface FrontPageViewController : AuthedViewController <UINavigationControllerDelegate, UIImagePickerControllerDelegate>

@property (strong, nonatomic) IBOutlet UITextView *resultTextView;

@end
