//
//  FrontPageViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "FrontPageViewController.h"
#import "AWSAPIClientsManager.h"

@interface FrontPageViewController ()
@property (nonatomic) NSString *originalResultTextViewString;
@end

@implementation FrontPageViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    _originalResultTextViewString = _resultTextView.text;
    [self fetchMe];
}

-(void)viewDidLayoutSubviews {
    _resultTextView.contentOffset = CGPointZero;
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}


- (IBAction)refreshAction:(UIBarButtonItem *)sender {
    [self fetchMe];
}

- (void)fetchMe {
    _resultTextView.text = _originalResultTextViewString;
    _resultTextView.contentOffset = CGPointZero;

    // Do any additional setup after loading the view.
    AWSTask *meGetTask = [[AWSAPIClientsManager authedClient] userMeGet];
    [meGetTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            NSLog(@"got something");
            
            if (task.error) {
                if (task.error.userInfo[@"HTTPBody"]) {
                    NSError *error;
                    MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                    NSLog(@"%@", myError.description);
                } else {
                    NSLog(@"%@", task.error.description);
                }
                return;
            }
            MYPREFIXUser *user = task.result;
            _resultTextView.text = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:user.dictionaryValue options:NSJSONWritingPrettyPrinted error:nil] encoding:NSUTF8StringEncoding];
            _resultTextView.contentOffset = CGPointZero;
        });
        
        return nil;
    }];
}

- (IBAction)invalidateTokenAction:(id)sender {
    [AWSAPIClientsManager invalidateAuth];
}

@end
