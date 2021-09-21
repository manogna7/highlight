import 'rc-slider/assets/index.css';

import { useAuthContext } from '@authentication/AuthContext';
import ButtonLink from '@components/Button/ButtonLink/ButtonLink';
import {
    DEMO_WORKSPACE_APPLICATION_ID,
    DEMO_WORKSPACE_PROXY_APPLICATION_ID,
} from '@components/DemoWorkspaceButton/DemoWorkspaceButton';
import ElevatedCard from '@components/ElevatedCard/ElevatedCard';
import FullBleedCard from '@components/FullBleedCard/FullBleedCard';
import Modal from '@components/Modal/Modal';
import { useMarkSessionAsViewedMutation } from '@graph/hooks';
import { EventType, Replayer } from '@highlight-run/rrweb';
import { eventWithTime } from '@highlight-run/rrweb/dist/types';
import NoActiveSessionCard from '@pages/Player/components/NoActiveSessionCard/NoActiveSessionCard';
import PanelToggleButton from '@pages/Player/components/PanelToggleButton/PanelToggleButton';
import { PlayerUIContextProvider } from '@pages/Player/context/PlayerUIContext';
import { HighlightEvent } from '@pages/Player/HighlightEvent';
import PlayerCommentCanvas, {
    Coordinates2D,
} from '@pages/Player/PlayerCommentCanvas/PlayerCommentCanvas';
import {
    SessionViewability,
    usePlayer,
} from '@pages/Player/PlayerHook/PlayerHook';
import usePlayerConfiguration from '@pages/Player/PlayerHook/utils/usePlayerConfiguration';
import PlayerPageProductTour from '@pages/Player/PlayerPageProductTour/PlayerPageProductTour';
import {
    ReplayerContextProvider,
    ReplayerState,
    useReplayerContext,
} from '@pages/Player/ReplayerContext';
import RightPlayerPanel from '@pages/Player/RightPlayerPanel/RightPlayerPanel';
import SearchPanel from '@pages/Player/SearchPanel/SearchPanel';
import SessionLevelBar from '@pages/Player/SessionLevelBar/SessionLevelBar';
import { StreamElement } from '@pages/Player/StreamElement/StreamElement';
import { NewCommentForm } from '@pages/Player/Toolbar/NewCommentForm/NewCommentForm';
import { Toolbar } from '@pages/Player/Toolbar/Toolbar';
import { usePlayerFullscreen } from '@pages/Player/utils/PlayerHooks';
import { IntegrationCard } from '@pages/Sessions/IntegrationCard/IntegrationCard';
import { SessionSearchOption } from '@pages/Sessions/SessionsFeedV2/components/SessionSearch/SessionSearch';
import { isOnPrem } from '@util/onPrem/onPremUtils';
import { useParams } from '@util/react-router/useParams';
import classNames from 'classnames';
import _ from 'lodash';
import Lottie from 'lottie-react';
import React, {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import useResizeAware from 'react-resize-aware';
import AsyncSelect from 'react-select/async';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { BooleanParam, useQueryParam } from 'use-query-params';

import WaitingAnimation from '../../lottie/waiting.json';
import styles from './PlayerPage.module.scss';

interface Props {
    integrated: boolean;
}

const Player = ({ integrated }: Props) => {
    const { isLoggedIn } = useAuthContext();
    const { session_id, organization_id } = useParams<{
        session_id: string;
        organization_id: string;
    }>();
    const organizationIdRemapped =
        organization_id === DEMO_WORKSPACE_APPLICATION_ID
            ? DEMO_WORKSPACE_PROXY_APPLICATION_ID
            : organization_id;
    const [resizeListener, sizes] = useResizeAware();

    const [searchBarRef, setSearchBarRef] = useState<
        AsyncSelect<SessionSearchOption, true> | undefined
    >(undefined);
    const player = usePlayer();
    const {
        state: replayerState,
        scale: replayerScale,
        setScale,
        replayer,
        time,
        sessionViewability,
        isPlayerReady,
        session,
    } = player;
    const {
        setShowLeftPanel,
        showLeftPanel: showLeftPanelPreference,
        showRightPanel,
    } = usePlayerConfiguration();
    const playerWrapperRef = useRef<HTMLDivElement>(null);
    const {
        isPlayerFullscreen,
        setIsPlayerFullscreen,
        playerCenterPanelRef,
    } = usePlayerFullscreen();
    const [detailedPanel, setDetailedPanel] = useState<
        | { title: string | React.ReactNode; content: React.ReactNode }
        | undefined
    >(undefined);
    const newCommentModalRef = useRef<HTMLDivElement>(null);
    const [markSessionAsViewed] = useMarkSessionAsViewedMutation();
    const [commentModalPosition, setCommentModalPosition] = useState<
        Coordinates2D | undefined
    >(undefined);
    const [commentPosition, setCommentPosition] = useState<
        Coordinates2D | undefined
    >(undefined);

    useEffect(() => {
        if (session_id && isLoggedIn) {
            markSessionAsViewed({
                variables: { id: session_id, viewed: true },
            });
        }
    }, [session_id, isLoggedIn, markSessionAsViewed]);

    useEffect(() => {
        if (!session_id) {
            setShowLeftPanel(true);
        }
    }, [session_id, setShowLeftPanel]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const resizePlayer = (replayer: Replayer): boolean => {
        const width = replayer?.wrapper?.getBoundingClientRect().width;
        const height = replayer?.wrapper?.getBoundingClientRect().height;
        const targetWidth = playerWrapperRef.current?.clientWidth;
        const targetHeight = playerWrapperRef.current?.clientHeight;
        if (!width || !targetWidth || !height || !targetHeight) {
            return false;
        }
        const widthScale = (targetWidth - 80) / width;
        const heightScale = (targetHeight - 80) / height;
        const scale = Math.min(heightScale, widthScale);

        if (scale <= 0) {
            return false;
        }

        // why translate -50 -50 -> https://medium.com/front-end-weekly/absolute-centering-in-css-ea3a9d0ad72e
        replayer?.wrapper?.setAttribute(
            'style',
            `transform: scale(${replayerScale * scale}) translate(-50%, -50%)`
        );

        setScale((s) => {
            return s * scale;
        });
        return true;
    };

    // This adjusts the dimensions (i.e. scale()) of the iframe when the page loads.
    useEffect(() => {
        const i = window.setInterval(() => {
            if (replayer && resizePlayer(replayer)) {
                clearInterval(i);
            }
        }, 200);
        return () => {
            i && clearInterval(i);
        };
    }, [resizePlayer, replayer]);

    // On any change to replayer, 'sizes', or 'showConsole', refresh the size of the player.
    useEffect(() => {
        replayer && resizePlayer(replayer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sizes, replayer]);

    const showLeftPanel =
        showLeftPanelPreference &&
        sessionViewability !== SessionViewability.OVER_BILLING_QUOTA;

    return (
        <PlayerUIContextProvider
            value={{
                searchBarRef,
                setSearchBarRef,
                isPlayerFullscreen,
                setIsPlayerFullscreen,
                playerCenterPanelRef,
                detailedPanel,
                setDetailedPanel,
            }}
        >
            <ReplayerContextProvider value={player}>
                {!integrated && <IntegrationCard />}
                {isPlayerReady && !isLoggedIn && (
                    <>
                        <Suspense fallback={null}>
                            <PlayerPageProductTour />
                        </Suspense>
                    </>
                )}
                <div
                    className={classNames(
                        styles.playerBody,
                        styles.gridBackground,
                        {
                            [styles.withLeftPanel]: showLeftPanel,
                        }
                    )}
                >
                    <div
                        className={classNames(styles.playerLeftPanel, {
                            [styles.hidden]: !showLeftPanel,
                        })}
                    >
                        <SearchPanel visible={showLeftPanel} />
                        <PanelToggleButton
                            className={classNames(
                                styles.panelToggleButton,
                                styles.panelToggleButtonLeft,
                                {
                                    [styles.panelShown]: showLeftPanelPreference,
                                }
                            )}
                            direction="left"
                            isOpen={showLeftPanelPreference}
                            onClick={() => {
                                setShowLeftPanel(!showLeftPanelPreference);
                            }}
                        />
                    </div>
                    {sessionViewability ===
                        SessionViewability.OVER_BILLING_QUOTA && (
                        <FullBleedCard
                            title="Session quota reached 😔"
                            animation={
                                <Lottie animationData={WaitingAnimation} />
                            }
                        >
                            <p>
                                This session was recorded after you reached your
                                session quota. To view it, upgrade your plan.
                            </p>
                            <ButtonLink
                                to={`/${organizationIdRemapped}/billing`}
                                trackingId="PlayerPageUpgradePlan"
                                className={styles.center}
                            >
                                Upgrade Plan
                            </ButtonLink>
                        </FullBleedCard>
                    )}
                    {sessionViewability === SessionViewability.EMPTY_SESSION ? (
                        <ElevatedCard
                            className={styles.emptySessionCard}
                            title="Session isn't ready to view yet 😔"
                            animation={
                                <Lottie animationData={WaitingAnimation} />
                            }
                        >
                            <p>
                                We need more time to process this session.{' '}
                                {!isOnPrem ? (
                                    <>
                                        If this looks like a bug, shoot us a
                                        message on{' '}
                                        <span
                                            className={styles.intercomLink}
                                            onClick={() => {
                                                window.Intercom(
                                                    'showNewMessage',
                                                    `I'm seeing an empty session. This is the session ID: "${session_id}"`
                                                );
                                            }}
                                        >
                                            Intercom
                                        </span>
                                        .
                                    </>
                                ) : (
                                    <>
                                        If this looks like a bug, please reach
                                        out to us!
                                    </>
                                )}
                            </p>
                        </ElevatedCard>
                    ) : (sessionViewability === SessionViewability.VIEWABLE &&
                          !!session) ||
                      replayerState !== ReplayerState.Empty ||
                      (replayerState === ReplayerState.Empty &&
                          !!session_id) ? (
                        <div
                            id="playerCenterPanel"
                            className={classNames(styles.playerCenterPanel, {
                                [styles.gridBackground]: isPlayerFullscreen,
                            })}
                            ref={playerCenterPanelRef}
                        >
                            <div className={styles.playerContainer}>
                                <div className={styles.rrwebPlayerSection}>
                                    <div className={styles.playerCenterColumn}>
                                        {!isPlayerFullscreen && (
                                            <SessionLevelBar />
                                        )}
                                        <div
                                            className={
                                                styles.rrwebPlayerWrapper
                                            }
                                            ref={playerWrapperRef}
                                        >
                                            {resizeListener}
                                            {replayerState ===
                                                ReplayerState.SessionRecordingStopped && (
                                                <div
                                                    className={
                                                        styles.manuallyStoppedMessageContainer
                                                    }
                                                    style={{
                                                        height: replayer?.wrapper.getBoundingClientRect()
                                                            .height,
                                                        width: replayer?.wrapper.getBoundingClientRect()
                                                            .width,
                                                    }}
                                                >
                                                    <ElevatedCard title="Session recording manually stopped">
                                                        <p>
                                                            <a
                                                                href="https://docs.highlight.run/reference#stop"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                <code>
                                                                    H.stop()
                                                                </code>
                                                            </a>{' '}
                                                            was called during
                                                            the session. Calling
                                                            this method stops
                                                            the session
                                                            recording. If you
                                                            expect the recording
                                                            to continue please
                                                            check where you are
                                                            calling{' '}
                                                            <a
                                                                href="https://docs.highlight.run/reference#stop"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                <code>
                                                                    H.stop()
                                                                </code>
                                                            </a>
                                                            .
                                                        </p>
                                                    </ElevatedCard>
                                                </div>
                                            )}
                                            {isPlayerReady && (
                                                <PlayerCommentCanvas
                                                    setModalPosition={
                                                        setCommentModalPosition
                                                    }
                                                    isReplayerReady={
                                                        isPlayerReady
                                                    }
                                                    modalPosition={
                                                        commentModalPosition
                                                    }
                                                    setCommentPosition={
                                                        setCommentPosition
                                                    }
                                                />
                                            )}
                                            <div
                                                style={{
                                                    visibility: isPlayerReady
                                                        ? 'visible'
                                                        : 'hidden',
                                                }}
                                                className={classNames(
                                                    styles.rrwebPlayerDiv,
                                                    'highlight-block'
                                                )}
                                                id="player"
                                            />
                                            {!isPlayerReady && (
                                                <PlayerSkeleton
                                                    showingLeftPanel={
                                                        showLeftPanel
                                                    }
                                                    showingRightPanel={
                                                        showRightPanel
                                                    }
                                                    width={
                                                        playerWrapperRef.current
                                                            ?.clientWidth
                                                    }
                                                />
                                            )}
                                        </div>
                                        <Toolbar />
                                    </div>

                                    {!isPlayerFullscreen && (
                                        <RightPlayerPanel />
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <NoActiveSessionCard />
                    )}
                    <Modal
                        visible={commentModalPosition !== undefined}
                        onCancel={() => {
                            setCommentModalPosition(undefined);
                        }}
                        // Sets the Modal's mount node as the player center panel.
                        // The default is document.body
                        // We override here to be able to show the comments when the player is in fullscreen
                        // Without this, the new comment modal would be below the fullscreen view.
                        getContainer={() => {
                            const playerCenterPanel = document.getElementById(
                                'playerCenterPanel'
                            );

                            if (playerCenterPanel) {
                                return playerCenterPanel;
                            }

                            return document.body;
                        }}
                        destroyOnClose
                        minimal
                        width="324px"
                        style={{
                            left: `${commentModalPosition?.x}px`,
                            top: `${commentModalPosition?.y}px`,
                            margin: 0,
                        }}
                        mask={false}
                        modalRender={(node) => (
                            <div className={styles.commentModal}>{node}</div>
                        )}
                    >
                        <div ref={newCommentModalRef}>
                            <NewCommentForm
                                currentTime={Math.floor(time)}
                                onCloseHandler={() => {
                                    setCommentModalPosition(undefined);
                                }}
                                commentPosition={commentPosition}
                                parentRef={newCommentModalRef}
                            />
                        </div>
                    </Modal>
                </div>
            </ReplayerContextProvider>
        </PlayerUIContextProvider>
    );
};

export const EventStream = () => {
    const [debug] = useQueryParam('debug', BooleanParam);
    const { replayer, time, events, state } = useReplayerContext();
    const [currEvent, setCurrEvent] = useState('');
    const [
        isInteractingWithStreamEvents,
        setIsInteractingWithStreamEvents,
    ] = useState(false);
    const virtuoso = useRef<VirtuosoHandle>(null);

    useEffect(() => {
        if (!replayer) return;
        replayer.on('event-cast', (e: any) => {
            const event = e as HighlightEvent;
            if (usefulEvent(event) || debug) {
                setCurrEvent(event.identifier);
            }
        });
    }, [replayer, debug]);

    const usefulEvents = useMemo(
        () => (debug ? events : events.filter(usefulEvent)),
        [events, debug]
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const scrollFunction = useCallback(
        _.debounce(
            (
                currentEventId: string,
                usefulEventsList: HighlightEvent[],
                state
            ) => {
                if (virtuoso.current) {
                    if (state === ReplayerState.Playing) {
                        const matchingEventIndex = usefulEventsList.findIndex(
                            (event) => event.identifier === currentEventId
                        );

                        if (matchingEventIndex > -1) {
                            virtuoso.current.scrollToIndex({
                                index: matchingEventIndex,
                                align: 'center',
                                behavior: 'smooth',
                            });
                        }
                    }
                }
            },
            1000 / 60
        ),
        []
    );

    useEffect(() => {
        if (!isInteractingWithStreamEvents) {
            scrollFunction(currEvent, usefulEvents, state);
        }
    }, [
        currEvent,
        scrollFunction,
        usefulEvents,
        isInteractingWithStreamEvents,
        state,
    ]);

    return (
        <>
            <div id="wrapper" className={styles.eventStreamContainer}>
                {!events.length ? (
                    <div>
                        <Skeleton
                            count={20}
                            height={43}
                            width="301px"
                            style={{
                                marginTop: 16,
                                marginLeft: 24,
                                marginRight: 24,
                                borderRadius: 8,
                            }}
                        />
                    </div>
                ) : (
                    replayer && (
                        <Virtuoso
                            onMouseEnter={() => {
                                setIsInteractingWithStreamEvents(true);
                            }}
                            onMouseLeave={() => {
                                setIsInteractingWithStreamEvents(false);
                            }}
                            //     @ts-ignore
                            components={{ List: VirtuosoList }}
                            ref={virtuoso}
                            data={usefulEvents}
                            overscan={500}
                            itemContent={(index, event) => (
                                <StreamElement
                                    e={event}
                                    key={index}
                                    start={replayer.getMetaData().startTime}
                                    isCurrent={
                                        event.timestamp -
                                            replayer.getMetaData().startTime ===
                                            time ||
                                        event.identifier === currEvent
                                    }
                                    onGoToHandler={setCurrEvent}
                                />
                            )}
                        />
                    )
                )}
            </div>
        </>
    );
};

const PlayerSkeleton = ({
    width,
    showingLeftPanel,
    showingRightPanel,
}: {
    width: number | undefined;
    showingLeftPanel: boolean;
    showingRightPanel: boolean;
}) => {
    const { showDevTools } = usePlayerConfiguration();
    let adjustedWidth = width ?? 80;

    if (showingLeftPanel) {
        adjustedWidth -= 475;
    }
    if (showingRightPanel) {
        adjustedWidth -= 350;
    }
    adjustedWidth = Math.min(Math.max(300, adjustedWidth), 600);

    return (
        <SkeletonTheme
            color={'var(--text-primary-inverted)'}
            highlightColor={'#f5f5f5'}
        >
            <Skeleton
                height={!showDevTools ? adjustedWidth * 0.8 : '200px'}
                width={adjustedWidth}
                duration={1}
            />
        </SkeletonTheme>
    );
};

// used in filter() type methods to fetch events we want
const usefulEvent = (e: eventWithTime): boolean => {
    if (e.type === EventType.Custom) {
        return !!e.data.tag;
    }
    // If its not an 'incrementalSnapshot', discard.
    if ((e as eventWithTime).type !== EventType.IncrementalSnapshot)
        return false;

    return false;
};

export default Player;

const VirtuosoList = React.forwardRef((props, ref) => {
    // @ts-ignore
    return <div {...props} ref={ref} className={styles.virtualList} />;
});
