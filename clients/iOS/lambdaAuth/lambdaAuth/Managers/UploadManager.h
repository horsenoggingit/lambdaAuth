//
//  UploadManager.h
//  lambdaAuth
//
//  Created by James Infusino on 2/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <Foundation/Foundation.h>

typedef void (^FileProgressBlock)(id uploadId, int64_t bytesSent, int64_t bytesExpectedToSend);
typedef void (^FileTransferDoneBlock)(id uploadId, NSString *state, NSError *error, NSInteger statusCode);

@interface UploadManager : NSObject <NSURLSessionDelegate, NSURLSessionDataDelegate>

+(UploadManager *)sharedUploadManager;
-(id)uploadImage:(UIImage *)image withUploadURLString:(NSString *)urlString progressBlock:(FileProgressBlock)progressBlock finishedBlock:(FileTransferDoneBlock)finishedBlock;

@end
