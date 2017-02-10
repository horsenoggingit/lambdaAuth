//
//  UploadManager.m
//  lambdaAuth
//
//  Created by James Infusino on 2/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <UIKit/UIKit.h>
#import "UploadManager.h"

#define UPLOAD_DIRECTORY_NAME @"uploads"

@interface UploadManager ()

@property (nonatomic) NSURLSession *session;
@property (nonatomic) NSMutableDictionary *uploadInfo;

@end

@implementation UploadManager

UploadManager *__sharedManager;

+(UploadManager *)sharedUploadManager {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        __sharedManager = [[UploadManager alloc] init];
    });
    return __sharedManager;
}


-(instancetype)init {
    
    self = [super init];
    
    if (self) {
        _session = [NSURLSession sessionWithConfiguration:[NSURLSessionConfiguration backgroundSessionConfigurationWithIdentifier:@"com.lambadAuth.sharedsession"]
                                                 delegate:self
                                            delegateQueue:nil];
        
        _uploadInfo = [[NSMutableDictionary alloc] init];
    }
    
    return self;
}

-(NSString *)getUploadDirectory {
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    if (paths.count == 0) {
        NSLog(@"No available NSDocumentDirectory.");
    }
    NSString *docPath = paths[0];
    NSFileManager *fm = [NSFileManager defaultManager];
    if (![fm fileExistsAtPath:[docPath stringByAppendingPathComponent:UPLOAD_DIRECTORY_NAME] isDirectory:NULL]) {
        NSError *error;
        [fm createDirectoryAtPath:[docPath stringByAppendingPathComponent:UPLOAD_DIRECTORY_NAME] withIntermediateDirectories:YES attributes:nil error:&error];
        if (error) {
            NSLog(@"%@", error.description);
        }
        NSURL* URL= [NSURL fileURLWithPath: [docPath stringByAppendingPathComponent:UPLOAD_DIRECTORY_NAME]];
        [URL setResourceValue: [NSNumber numberWithBool: YES] forKey: NSURLIsExcludedFromBackupKey error: &error];
        if (error) {
            NSLog(@"%@", error.description);
        }
    }
    return [docPath stringByAppendingPathComponent:UPLOAD_DIRECTORY_NAME];
}


-(id)uploadImage:(UIImage *)image withUploadURLString:(NSString *)urlString progressBlock:(FileProgressBlock)progressBlock finishedBlock:(FileTransferDoneBlock)finishedBlock {
    NSString *fname = [[self getUploadDirectory] stringByAppendingPathComponent:[[NSUUID UUID] UUIDString]];

    [UIImageJPEGRepresentation(image, 0.9) writeToFile:fname atomically:YES];

    NSURL *uploadURL = [NSURL URLWithString:urlString];
    
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:uploadURL];
    request.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
    [request setHTTPMethod:@"PUT"];
    [request setValue:@"image/jpeg" forHTTPHeaderField:@"Content-Type"];

    
    NSURLSessionUploadTask *uploadTask = [_session uploadTaskWithRequest:request fromFile:[NSURL fileURLWithPath:fname]];
    _uploadInfo[uploadTask] = [[NSMutableDictionary alloc] init];
    _uploadInfo[uploadTask][@"filename"] = fname;
    _uploadInfo[uploadTask][@"state"] = @"uploading";
    if (progressBlock) {
        _uploadInfo[uploadTask][@"progressBlock"] = [progressBlock copy];
    }
    if (finishedBlock) {
        _uploadInfo[uploadTask][@"finishedBlock"] = [finishedBlock copy];
    }
    
    [uploadTask resume];
    return uploadTask;
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    if (error) {
        _uploadInfo[task][@"state"] = @"error";
        _uploadInfo[task][@"error"] = error;
    } else {
        _uploadInfo[task][@"state"] = @"success";
    }
    if (task.response) {
        _uploadInfo[task][@"response"] = task.response;
        _uploadInfo[task][@"statusCode"] = @([(NSHTTPURLResponse *)task.response statusCode]);
        NSLog(@"Status code %ld", [_uploadInfo[task][@"statusCode"] integerValue]);
        if ([_uploadInfo[task][@"statusCode"] integerValue] != 200) {
            _uploadInfo[task][@"state"] = @"error";
        }
    }
    if (_uploadInfo[task][@"data"]) {
        NSLog(@"upload data %@", [[NSString alloc] initWithData:_uploadInfo[task][@"data"] encoding:NSUTF8StringEncoding]);
    }
    if ([_uploadInfo[task][@"state"] isEqual:@"success"]) {
        NSFileManager *fm = [NSFileManager defaultManager];
        NSError *error;
        [fm removeItemAtPath:_uploadInfo[task][@"filename"] error:&error];
        if (error) {
            NSLog(@"%@", error.description);
        }
    }
    FileTransferDoneBlock doneBlock = _uploadInfo[task][@"finishedBlock"];
    if (doneBlock) {
        doneBlock(task, _uploadInfo[task][@"state"], _uploadInfo[task][@"error"], [_uploadInfo[task][@"statusCode"] integerValue]);
    }
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didSendBodyData:(int64_t)bytesSent totalBytesSent:(int64_t)totalBytesSent totalBytesExpectedToSend:(int64_t)totalBytesExpectedToSend {
    _uploadInfo[task][@"bytesSet"] = @(totalBytesSent);
    _uploadInfo[task][@"bytesExpectedToSend"] = @(totalBytesExpectedToSend);
    NSLog(@"Upload %lld of %lld", totalBytesSent, totalBytesExpectedToSend);
    FileProgressBlock progressBlock = _uploadInfo[task][@"progressBlock"];
    if (progressBlock) {
        progressBlock(task, totalBytesSent, totalBytesExpectedToSend);
    }
}

- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveData:(NSData *)data {
    if (!_uploadInfo[dataTask][@"data"]) {
        _uploadInfo[dataTask][@"data"] = [NSMutableData dataWithData:data];
    } else {
        [_uploadInfo[dataTask][@"data"] appendData:data];
    }
    
}
@end
