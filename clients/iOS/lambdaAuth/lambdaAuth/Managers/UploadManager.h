//
//  UploadManager.h
//  lambdaAuth
//
//  Created by James Infusino on 2/2/17.
//  Copyright © 2017 horsenoggin. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface UploadManager : NSObject <NSURLSessionDelegate, NSURLSessionDataDelegate>

+(UploadManager *)sharedUploadManager;
-(void)uploadImage:(UIImage *)image withUploadURLString:(NSString *)urlString;

@end
