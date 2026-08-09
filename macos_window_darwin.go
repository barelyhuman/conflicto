//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework AppKit -framework QuartzCore
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>

static void setCornerRadiusOnView(NSView *view, CGFloat radius) {
	if (view == nil) return;
	view.wantsLayer = YES;
	view.layer.cornerRadius = radius;
	view.layer.masksToBounds = YES;
	if (@available(macOS 10.15, *)) {
		view.layer.cornerCurve = kCACornerCurveContinuous;
	}
}

static void applyRadiusToWindows(CGFloat radius) {
	for (NSWindow *window in [NSApp windows]) {
		if (![window isVisible] && window != [NSApp mainWindow]) {
			continue;
		}
		window.opaque = NO;
		window.backgroundColor = [NSColor clearColor];
		window.hasShadow = YES;

		NSView *content = window.contentView;
		if (content == nil) continue;

		// Mask the content view — this clips vibrancy + webview together.
		setCornerRadiusOnView(content, radius);

		// Also mask direct children (NSVisualEffectView, WKWebView) explicitly.
		for (NSView *sub in content.subviews) {
			setCornerRadiusOnView(sub, radius);
		}
	}
}

void ApplyMacWindowCornerRadius(double radius) {
	CGFloat r = (CGFloat)radius;
	dispatch_async(dispatch_get_main_queue(), ^{
		applyRadiusToWindows(r);

		static dispatch_once_t once;
		dispatch_once(&once, ^{
			NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
			[nc addObserverForName:NSWindowDidResizeNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:^(NSNotification *note) {
				NSWindow *w = note.object;
				if (w == nil) return;
				BOOL fullscreen = (w.styleMask & NSWindowStyleMaskFullScreen) != 0;
				CGFloat apply = fullscreen ? 0.0 : r;
				if (w.contentView != nil) {
					setCornerRadiusOnView(w.contentView, apply);
				}
			}];
			[nc addObserverForName:NSWindowDidEnterFullScreenNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:^(NSNotification *note) {
				NSWindow *w = note.object;
				if (w.contentView != nil) {
					setCornerRadiusOnView(w.contentView, 0.0);
				}
			}];
			[nc addObserverForName:NSWindowDidExitFullScreenNotification
							object:nil
							 queue:[NSOperationQueue mainQueue]
						usingBlock:^(NSNotification *note) {
				NSWindow *w = note.object;
				if (w.contentView != nil) {
					setCornerRadiusOnView(w.contentView, r);
				}
			}];
		});
	});
}
*/
import "C"

func applyMacWindowCornerRadius(radius float64) {
	C.ApplyMacWindowCornerRadius(C.double(radius))
}
