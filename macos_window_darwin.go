//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework AppKit
#import <Cocoa/Cocoa.h>

static CGFloat gTrafficX = 16.0;
static CGFloat gTrafficY = 16.0;

// Position native traffic lights. x/y are distances from the top-left of the
// titlebar button container (same convention as Electron trafficLightPosition).
// y is chosen so 12pt buttons center in the 44px island header: (44-12)/2 = 16.
static void positionTrafficLights(NSWindow *window) {
	if (window == nil) return;
	if ((window.styleMask & NSWindowStyleMaskFullScreen) != 0) return;

	NSButton *closeBtn = [window standardWindowButton:NSWindowCloseButton];
	NSButton *miniBtn = [window standardWindowButton:NSWindowMiniaturizeButton];
	NSButton *zoomBtn = [window standardWindowButton:NSWindowZoomButton];
	if (closeBtn == nil || miniBtn == nil || zoomBtn == nil) return;

	NSView *container = closeBtn.superview;
	if (container == nil) return;

	CGFloat space1 = NSMinX(miniBtn.frame) - NSMinX(closeBtn.frame);
	CGFloat space2 = NSMinX(zoomBtn.frame) - NSMinX(miniBtn.frame);
	CGFloat btnH = NSHeight(closeBtn.frame);
	CGFloat containerH = NSHeight(container.frame);
	CGFloat btnY = containerH - gTrafficY - btnH;

	[closeBtn setFrameOrigin:NSMakePoint(gTrafficX, btnY)];
	[miniBtn setFrameOrigin:NSMakePoint(gTrafficX + space1, btnY)];
	[zoomBtn setFrameOrigin:NSMakePoint(gTrafficX + space1 + space2, btnY)];
}

static void applyTrafficLightsToWindows(void) {
	for (NSWindow *window in [NSApp windows]) {
		if (![window isVisible] && window != [NSApp mainWindow]) {
			continue;
		}
		positionTrafficLights(window);
	}
}

void ApplyMacTrafficLightPosition(double x, double y) {
	gTrafficX = (CGFloat)x;
	gTrafficY = (CGFloat)y;
	dispatch_async(dispatch_get_main_queue(), ^{
		applyTrafficLightsToWindows();

		static dispatch_once_t once;
		dispatch_once(&once, ^{
			NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
			void (^reapply)(NSNotification *) = ^(NSNotification *note) {
				positionTrafficLights(note.object);
			};
			// AppKit resets button frames on resize / fullscreen transitions.
			[nc addObserverForName:NSWindowDidResizeNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:reapply];
			[nc addObserverForName:NSWindowDidEndLiveResizeNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:reapply];
			[nc addObserverForName:NSWindowDidExitFullScreenNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:reapply];
			[nc addObserverForName:NSWindowDidBecomeKeyNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:reapply];
		});
	});
}
*/
import "C"

// applyMacTrafficLightPosition moves the system traffic lights so they share
// a vertical center with the 44px island header toolbar.
func applyMacTrafficLightPosition(x, y float64) {
	C.ApplyMacTrafficLightPosition(C.double(x), C.double(y))
}
