//
//  FrontPageViewController.m
//  lambdaAuth
//
//  Created by James Infusino on 1/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import "FrontPageViewController.h"
#import "AWSAPIClientsManager.h"
#import "UploadManager.h"
#import <MobileCoreServices/MobileCoreServices.h>

@interface FrontPageViewController ()
@property (nonatomic) NSString *originalResultTextViewString;

@property (nonatomic) UIImagePickerController *imagePicker;
@property (nonatomic) UIImage *selectedImage;

@property (nonatomic) MYPREFIXUserPhotoUploadurlResponse *uploadURLResponse;
@property (nonatomic) BOOL isFetchingUploadResponse;
@end

@implementation FrontPageViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    _originalResultTextViewString = _resultTextView.text;
    [self fetchMe];
    [self getUploadUrl];
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
//    _resultTextView.contentOffset = CGPointZero;

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
        });
        
        return nil;
    }];
}

- (void)getUploadUrl {
    // also fetch an upload URL
    AWSTask *uploadUrlTask = [[AWSAPIClientsManager authedClient] userPhotoUploadurlGet];
    _isFetchingUploadResponse = YES;
    [uploadUrlTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            _isFetchingUploadResponse = NO;
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
            _uploadURLResponse = task.result;
            if (_selectedImage) {
                [self uploadSelectedImage];
            }
        });
        
        return nil;
    }];
    
}

- (IBAction)invalidateTokenAction:(id)sender {
    [AWSAPIClientsManager invalidateAuth];
}

- (IBAction)uploadPhotoAction:(id)sender {
    if (_imagePicker) {
        return;
    }
    
    if ([UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypePhotoLibrary]) {
        if (!_imagePicker) {
            _imagePicker = [[UIImagePickerController  alloc] init];
            _imagePicker.sourceType = UIImagePickerControllerSourceTypePhotoLibrary;
            _imagePicker.delegate = self;
            _imagePicker.mediaTypes =
            [[NSArray alloc] initWithObjects: (NSString *) kUTTypeImage, nil];
        }

        [self presentViewController:_imagePicker animated:YES completion:nil];
    }
}

#pragma mark - UIImagePickerControllerDelegate methods

-(void)imagePickerControllerDidCancel:(UIImagePickerController *)picker {
    [self dismissViewControllerAnimated:YES completion:^{
        _imagePicker = nil;
    }];
}

-(void)imagePickerController:(UIImagePickerController *)picker didFinishPickingMediaWithInfo:(NSDictionary<NSString *,id> *)info {
    [self dismissViewControllerAnimated:YES completion:^{
        _imagePicker = nil;
    }];
    _selectedImage = info[UIImagePickerControllerOriginalImage];
    if (_uploadURLResponse) {
        [self uploadSelectedImage];
    } else if (!_isFetchingUploadResponse) {
        [self getUploadUrl];
    }
}

-(void)uploadSelectedImage {
    if (!_selectedImage || !_uploadURLResponse) {
        return;
    }
    [[UploadManager sharedUploadManager] uploadImage:_selectedImage withUploadURLString:_uploadURLResponse.uploadUrl];
    _selectedImage = nil;
    _uploadURLResponse = nil;
    [self getUploadUrl];
}
@end
