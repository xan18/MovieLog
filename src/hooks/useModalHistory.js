import { useEffect, useRef } from 'react';

export function useModalHistory({ modalDepth, closeTopModal }) {
  const modalDepthRef = useRef(0);
  const prevModalDepthRef = useRef(0);
  const modalHistoryDepthRef = useRef(0);
  const popstateCloseCountRef = useRef(0);
  const programmaticBackCountRef = useRef(0);

  useEffect(() => {
    const prevDepth = prevModalDepthRef.current;

    if (modalDepth > prevDepth) {
      const delta = modalDepth - prevDepth;
      for (let i = 0; i < delta; i += 1) {
        const nextDepth = modalHistoryDepthRef.current + 1;
        window.history.pushState(
          { ...(window.history.state || {}), __movielogModal: true, __movielogModalDepth: nextDepth },
          ''
        );
        modalHistoryDepthRef.current = nextDepth;
      }
    } else if (modalDepth < prevDepth) {
      let delta = prevDepth - modalDepth;

      if (popstateCloseCountRef.current > 0) {
        const handledByPopstate = Math.min(delta, popstateCloseCountRef.current);
        popstateCloseCountRef.current -= handledByPopstate;
        delta -= handledByPopstate;
      }

      const closable = Math.min(delta, modalHistoryDepthRef.current);
      if (closable > 0) {
        programmaticBackCountRef.current += closable;
        modalHistoryDepthRef.current -= closable;
        for (let i = 0; i < closable; i += 1) {
          window.history.back();
        }
      }
    }

    prevModalDepthRef.current = modalDepth;
    modalDepthRef.current = modalDepth;
  }, [modalDepth]);

  useEffect(() => {
    const onPopState = () => {
      if (programmaticBackCountRef.current > 0) {
        programmaticBackCountRef.current -= 1;
        return;
      }

      if (modalDepthRef.current < 1) return;

      if (modalHistoryDepthRef.current > 0) {
        modalHistoryDepthRef.current -= 1;
      }
      popstateCloseCountRef.current += 1;
      closeTopModal(true);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeTopModal]);
}
