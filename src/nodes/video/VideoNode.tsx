import type { NodeProps } from '@xyflow/react';
import { Camera, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { readAsDataUrl } from '@/lib/files';
import type { NodeOf } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { IconButton } from '@/ui/Button';
import { createNode } from '../factory';
import { imageBox } from '../image/spec';
import { NodeShell } from '../NodeShell';
import { grabFrame } from '../web/frameMessages';
import { canGrabFrames, useWebExtension } from '../web/useWebExtension';
import { toEmbedUrl } from './embedUrl';
import { clock, command, listen, parsePlaying, playerKind } from './player';

export function VideoNode({ id, data, selected, dragging }: NodeProps<NodeOf<'video'>>) {
  const [resizing, setResizing] = useState(false);
  const src = toEmbedUrl(data.url);
  // An iframe swallows mouse events, so it only becomes interactive once its node is selected and still.
  const interactive = selected && !dragging && !resizing;
  const kind = playerKind(src);
  const frame = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  // Pixels of a cross-origin player can only be read from inside it, which takes the browser extension.
  const extension = useWebExtension();
  const canGrab = kind === 'youtube' && canGrabFrames(extension);

  /** Puts the video's current frame on the canvas as an image node beside the video. */
  const grab = async () => {
    setGrabbing(true);
    try {
      const picture = await grabFrame(frame.current?.contentWindow);
      const src = await readAsDataUrl(picture.blob);
      const size = imageBox(picture);
      const at = useCanvasStore.getState().nodes.find((n) => n.id === id);
      const position = { x: (at?.position.x ?? 0) + (at?.width ?? 0) + 24, y: at?.position.y ?? 0 };
      const title = `${data.title ?? 'Video'} ${clock(picture.time)}`;
      useCanvasStore.getState().addNodes([createNode('image', position, { src, title }, size)]);
      if (picture.black) toast.warning('The frame is black. The video may be protected, or just dark here.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not grab a frame.');
    } finally {
      setGrabbing(false);
    }
  };

  useEffect(() => {
    if (!kind) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const next = parsePlaying(kind, event.origin, event.data);
      if (next !== null) setPlaying(next);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [kind]);

  return (
    <NodeShell
      kind="video"
      selected={selected}
      live={interactive}
      customTitle={data.title}
      tint={data.color}
      resize={{ minWidth: 240, minHeight: 160, onResizing: setResizing }}
      steadyActions
      actions={
        kind && (
          <>
            {canGrab && (
              <IconButton
                icon={Camera}
                label="Grab this frame as an image"
                size="sm"
                disabled={grabbing}
                onClick={() => void grab()}
              />
            )}
            <IconButton
              icon={playing ? Pause : Play}
              label={playing ? 'Pause' : 'Play'}
              size="sm"
              onClick={() =>
                frame.current?.contentWindow && command(frame.current.contentWindow, kind, !playing)
              }
            />
          </>
        )
      }
    >
      {src ? (
        <iframe
          ref={frame}
          src={src}
          onLoad={() => kind && frame.current?.contentWindow && listen(frame.current.contentWindow, kind)}
          title="Embedded video"
          className={cn('h-full w-full border-0', !interactive && 'pointer-events-none')}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <p className="p-4 text-sm text-muted">Unsupported video URL: {data.url}</p>
      )}
    </NodeShell>
  );
}
