//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

void SetDockIcon(const void *data, int length) {
	@autoreleasepool {
		if (data == NULL || length <= 0) {
			return;
		}
		NSData *imageData = [NSData dataWithBytes:data length:length];
		NSImage *image = [[NSImage alloc] initWithData:imageData];
		if (image == nil) {
			return;
		}
		dispatch_async(dispatch_get_main_queue(), ^{
			[NSApp setApplicationIconImage:image];
		});
	}
}
*/
import "C"
import "unsafe"

func setDockIcon(icon []byte) {
	if len(icon) == 0 {
		return
	}
	C.SetDockIcon(unsafe.Pointer(&icon[0]), C.int(len(icon)))
}
