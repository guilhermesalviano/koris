import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../Modal', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="modal">{children}</div> : null,
}));

import AudioRecognitionModal from './AudioRecognitionModal';

describe('AudioRecognitionModal', () => {
  it('renders nothing when open is false', () => {
    const html = renderToStaticMarkup(
      <AudioRecognitionModal
        open={false}
        onClose={vi.fn()}
        onSend={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    expect(html).toBe('');
  });

  it('renders modern sound recognition modal when open is true', () => {
    const html = renderToStaticMarkup(
      <AudioRecognitionModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        onInsert={vi.fn()}
      />,
    );

    // Header elements
    expect(html).toContain('Sound Recognition');
    expect(html).toContain('Real-time voice &amp; speech detection');

    // Visualizer canvas and mic hero section
    expect(html).toContain('<canvas');
    expect(html).toContain('title="Start recording"');

    // Recognition output container
    expect(html).toContain('Recognized Speech');

    // Action buttons
    expect(html).toContain('Cancel');
    expect(html).toContain('Insert in Input');
    expect(html).toContain('Send to Chat');
  });

  it('disables send and insert buttons when there is no recognized text', () => {
    const html = renderToStaticMarkup(
      <AudioRecognitionModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        onInsert={vi.fn()}
        streaming={false}
      />,
    );

    expect(html).toContain('disabled=""');
  });

  it('renders disabled send button when streaming is true', () => {
    const html = renderToStaticMarkup(
      <AudioRecognitionModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        onInsert={vi.fn()}
        initialTranscript="Hello"
        streaming={true}
      />,
    );

    expect(html).toContain('disabled=""');
  });

  it('renders close button with accessibility labels', () => {
    const html = renderToStaticMarkup(
      <AudioRecognitionModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        onInsert={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Close dialog"');
    expect(html).toContain('title="Close (Esc)"');
  });

  describe('Microphone and Hardware Error Scenarios', () => {
    it('renders permission-blocked diagnostic card when permission is denied', () => {
      const html = renderToStaticMarkup(
        <AudioRecognitionModal
          open={true}
          onClose={vi.fn()}
          onSend={vi.fn()}
          onInsert={vi.fn()}
          initialError={{
            type: 'permission-denied',
            title: 'Microphone Permission Blocked',
            message: 'Microphone access was denied in your browser settings.',
            suggestion: 'Click the lock or settings icon in your browser address bar to allow microphone access, then click Try Again.',
            actionLabel: 'Try Again',
          }}
        />,
      );

      expect(html).toContain('Microphone Permission Blocked');
      expect(html).toContain('Microphone access was denied in your browser settings.');
      expect(html).toContain('Click the lock or settings icon in your browser address bar');
      expect(html).toContain('Try Again');
      expect(html).not.toContain('<canvas');
    });

    it('renders no-microphone diagnostic card when no audio input device is found', () => {
      const html = renderToStaticMarkup(
        <AudioRecognitionModal
          open={true}
          onClose={vi.fn()}
          onSend={vi.fn()}
          onInsert={vi.fn()}
          initialError={{
            type: 'no-microphone',
            title: 'No Microphone Detected',
            message: 'We could not find any connected microphone or audio input hardware.',
            suggestion: 'Please plug in or connect a microphone, headset, or webcam and click Check Devices.',
            actionLabel: 'Check Devices',
          }}
        />,
      );

      expect(html).toContain('No Microphone Detected');
      expect(html).toContain('We could not find any connected microphone');
      expect(html).toContain('Check Devices');
    });

    it('renders device-busy diagnostic card when microphone is locked by another app', () => {
      const html = renderToStaticMarkup(
        <AudioRecognitionModal
          open={true}
          onClose={vi.fn()}
          onSend={vi.fn()}
          onInsert={vi.fn()}
          initialError={{
            type: 'device-busy',
            title: 'Microphone In Use',
            message: 'Your microphone is currently in use by another application or locked by the system.',
            suggestion: 'Please close other applications using audio and try again.',
            actionLabel: 'Retry Connection',
          }}
        />,
      );

      expect(html).toContain('Microphone In Use');
      expect(html).toContain('Your microphone is currently in use by another application');
      expect(html).toContain('Retry Connection');
    });

    it('renders disconnected diagnostic card when device is unplugged mid-session', () => {
      const html = renderToStaticMarkup(
        <AudioRecognitionModal
          open={true}
          onClose={vi.fn()}
          onSend={vi.fn()}
          onInsert={vi.fn()}
          initialError={{
            type: 'disconnected',
            title: 'Microphone Disconnected',
            message: 'The active microphone was unplugged or disconnected.',
            suggestion: 'Reconnect your audio device to continue. Any recognized text was preserved.',
            actionLabel: 'Reconnect',
          }}
        />,
      );

      expect(html).toContain('Microphone Disconnected');
      expect(html).toContain('The active microphone was unplugged or disconnected');
      expect(html).toContain('Reconnect');
    });

    it('preserves recognized transcript and enables Send button even when an error occurs', () => {
      const html = renderToStaticMarkup(
        <AudioRecognitionModal
          open={true}
          onClose={vi.fn()}
          onSend={vi.fn()}
          onInsert={vi.fn()}
          initialTranscript="Create a task for tomorrow morning"
          initialError={{
            type: 'disconnected',
            title: 'Microphone Disconnected',
            message: 'Device unplugged',
            suggestion: 'Reconnect device',
            actionLabel: 'Reconnect',
          }}
        />,
      );

      expect(html).toContain('Create a task for tomorrow morning');
      expect(html).toContain('Send to Chat');
      expect(html).toContain('Insert in Input');
      // Send button should NOT be disabled when text exists
      expect(html).not.toContain('disabled=""');
    });
  });
});
