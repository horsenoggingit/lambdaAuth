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
#import "AsyncImageView.h"
#import <MobileCoreServices/MobileCoreServices.h>

@interface FrontPageViewController ()
@property (nonatomic) NSString *originalResultTextViewString;

@property (nonatomic) UIImagePickerController *imagePicker;
@property (nonatomic) UIImage *selectedImage;

@property (strong, nonatomic) IBOutlet UIButton *uploadPhotoButton;
@property (strong, nonatomic) IBOutlet UILabel *uploadLabel;

@property (strong, nonatomic) MYPREFIXUser *user;

@property (strong, nonatomic) NSMutableArray *userFetchCallbackArray;

@property (strong, nonatomic) NSString *photoId;
@property (nonatomic) NSInteger userFetchRetry;
@property (nonatomic) BOOL isFetchingUser;
@property (strong, nonatomic) IBOutlet AsyncImageView *asyncImageView;

@end

@implementation FrontPageViewController

- (void)viewDidLoad {
    _userFetchCallbackArray = [NSMutableArray array];
    [super viewDidLoad];
    _originalResultTextViewString = _resultTextView.text;
    __weak FrontPageViewController *weakSelf = self;
    [self fetchMe:^{
        [weakSelf loadBackgroundImage];
    }];
}

-(void)viewDidLayoutSubviews {
    _resultTextView.contentOffset = CGPointZero;
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}


- (IBAction)refreshAction:(UIBarButtonItem *)sender {
    [self fetchMe:nil];
}

- (void)fetchMe:(void(^)())completionBlock {
    _resultTextView.text = _originalResultTextViewString;
    if (completionBlock) {
        [_userFetchCallbackArray addObject:[completionBlock copy]];
    }
    
    if (_isFetchingUser) {
        return;
    }
    _isFetchingUser = YES;
    AWSTask *meGetTask = [[AWSAPIClientsManager authedClient] userMeGet];
    [meGetTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            _isFetchingUser = NO;
            NSLog(@"got something");
            
            if (task.error) {
                if (task.error.userInfo[@"HTTPBody"]) {
                    NSError *error;
                    MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                    NSLog(@"%@", myError.description);
                    _resultTextView.text = myError.description;
                } else {
                    NSLog(@"%@", task.error.description);
                    _resultTextView.text = task.error.description;
                }
            } else {
                _user = task.result;
                _resultTextView.text = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:_user.dictionaryValue options:NSJSONWritingPrettyPrinted error:nil] encoding:NSUTF8StringEncoding];
            }
            NSArray *userFetchArrayCopy = [_userFetchCallbackArray copy];
            [_userFetchCallbackArray removeAllObjects];
            [userFetchArrayCopy enumerateObjectsUsingBlock:^(void(^callbackBlock)() , NSUInteger idx, BOOL * _Nonnull stop) {
                callbackBlock();
            }];

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

-(void)imagePickerController:(UIImagePickerController *)picker didFinishPickingMediaWithInfo:(NSDictionary<NSString *, id> *)info {
    [self dismissViewControllerAnimated:YES completion:^{
        _imagePicker = nil;
    }];
    _selectedImage = info[UIImagePickerControllerOriginalImage];
    [self uploadSelectedImage];
}

-(void)loadBackgroundImage {
    if (_user.photoCount > 0) {
        [_asyncImageView setImageURL:[NSURL URLWithString:[NSString stringWithFormat:@"%@/%@/%@", _user.photoPathUrl, _user.photoBaseId, _user.photoId]]];
    }
}

-(void)checkForNewPhoto {
    __weak FrontPageViewController *weakSelf = self;
    [self fetchMe:^{
        if ([weakSelf.user.photoId isEqual:weakSelf.photoId]) {
            // load new photo
            [self loadBackgroundImage];
        } else {
            if (self.userFetchRetry++ < 5) {
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    [weakSelf checkForNewPhoto];
                });
            }
        }
    }];
}

-(void)uploadSelectedImage {
    if (!_selectedImage) {
        return;
    }
    _uploadPhotoButton.enabled = NO;
    _uploadLabel.alpha = 1;
    _uploadLabel.text = @"Fetching upload url.";
    // also fetch an upload URL
    AWSTask *uploadUrlTask = [[AWSAPIClientsManager authedClient] userPhotoUploadurlGet];
    [uploadUrlTask continueWithBlock:^id _Nullable(AWSTask * _Nonnull task) {
        dispatch_async(dispatch_get_main_queue(), ^{

            if (task.error) {
                if (task.error.userInfo[@"HTTPBody"]) {
                    NSError *error;
                    MYPREFIXError *myError = [MYPREFIXError modelWithDictionary:task.error.userInfo[@"HTTPBody"] error:&error];
                    NSLog(@"%@", myError.description);
                } else {
                    NSLog(@"%@", task.error.description);
                }
                _uploadPhotoButton.enabled = YES;
                self.uploadLabel.text = [NSString stringWithFormat:@"Fetch upload url failed."];
                [UIView animateKeyframesWithDuration:1 delay:2 options:UIViewKeyframeAnimationOptionCalculationModeLinear animations:^{
                    self.uploadLabel.alpha = 0;
                } completion:^(BOOL finished) {
                    
                }];
                return;
            }
            __weak FrontPageViewController *weakSelf = self;
            _uploadLabel.text = @"Uploading image...";
            _photoId = [[task.result photoId] componentsSeparatedByString:@"/"][1];
            [[UploadManager sharedUploadManager] uploadImage:_selectedImage withUploadURLString:[task.result uploadUrl] progressBlock:^(id uploadId, int64_t bytesSent, int64_t bytesExpectedToSend) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    weakSelf.uploadLabel.text = [NSString stringWithFormat:@"Uploaded %ld%%.", (long) (100.0 * (double)bytesSent/(double)bytesExpectedToSend)];
                });
            } finishedBlock:^(id uploadId, NSString *state, NSError *error, NSInteger statusCode) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    weakSelf.uploadPhotoButton.enabled = YES;
                    weakSelf.uploadLabel.text = [NSString stringWithFormat:@"Upload result: %@.", state];
                    [UIView animateKeyframesWithDuration:1 delay:2 options:UIViewKeyframeAnimationOptionCalculationModeLinear animations:^{
                        weakSelf.uploadLabel.alpha = 0;
                    } completion:^(BOOL finished) {
                        
                    }];
                    if ([state isEqual:@"success"]) {
                        weakSelf.userFetchRetry = 0;
                        [weakSelf checkForNewPhoto];
                    }

                });
            }];
            _selectedImage = nil;
        });
        return nil;
    }];
}
@end
