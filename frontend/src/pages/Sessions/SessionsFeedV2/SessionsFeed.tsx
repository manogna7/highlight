import {
    DEMO_WORKSPACE_APPLICATION_ID,
    DEMO_WORKSPACE_PROXY_APPLICATION_ID,
} from '@components/DemoWorkspaceButton/DemoWorkspaceButton';
import Tooltip from '@components/Tooltip/Tooltip';
import { usePlayerUIContext } from '@pages/Player/context/PlayerUIContext';
import { QueryBuilderState } from '@pages/Sessions/SessionsFeedV2/components/QueryBuilder/QueryBuilder';
import SessionFeedConfiguration, {
    formatCount,
} from '@pages/Sessions/SessionsFeedV2/components/SessionFeedConfiguration/SessionFeedConfiguration';
import { SessionFeedConfigurationContextProvider } from '@pages/Sessions/SessionsFeedV2/context/SessionFeedConfigurationContext';
import { useSessionFeedConfiguration } from '@pages/Sessions/SessionsFeedV2/hooks/useSessionFeedConfiguration';
import { useIntegrated } from '@util/integrated';
import { isOnPrem } from '@util/onPrem/onPremUtils';
import { useParams } from '@util/react-router/useParams';
import { message } from 'antd';
import classNames from 'classnames';
import React, {
    RefObject,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import useInfiniteScroll from 'react-infinite-scroll-hook';
import Skeleton from 'react-loading-skeleton';
import TextTransition from 'react-text-transition';

import { SearchEmptyState } from '../../../components/SearchEmptyState/SearchEmptyState';
import Switch from '../../../components/Switch/Switch';
import LimitedSessionCard from '../../../components/Upsell/LimitedSessionsCard/LimitedSessionsCard';
import {
    useGetBillingDetailsForProjectQuery,
    useGetSessionsOpenSearchQuery,
    useGetSessionsQuery,
    useUnprocessedSessionsCountQuery,
} from '../../../graph/generated/hooks';
import { PlanType, SessionLifecycle } from '../../../graph/generated/schemas';
import usePlayerConfiguration from '../../Player/PlayerHook/utils/usePlayerConfiguration';
import { useReplayerContext } from '../../Player/ReplayerContext';
import {
    showLiveSessions,
    useSearchContext,
} from '../SearchContext/SearchContext';
import { LIVE_SEGMENT_ID } from '../SearchSidebar/SegmentPicker/SegmentPicker';
import MinimalSessionCard from './components/MinimalSessionCard/MinimalSessionCard';
import styles from './SessionsFeed.module.scss';

// const SESSIONS_FEED_POLL_INTERVAL = 1000 * 10;

export const SessionFeed = React.memo(() => {
    const { setSessionResults, sessionResults } = useReplayerContext();
    const { project_id, segment_id, session_secure_id } = useParams<{
        project_id: string;
        segment_id: string;
        session_secure_id: string;
    }>();
    const sessionFeedConfiguration = useSessionFeedConfiguration();
    const [count, setCount] = useState(10);
    const {
        autoPlaySessions,
        setAutoPlaySessions,
        setShowDetailedSessionView,
        showDetailedSessionView,
    } = usePlayerConfiguration();
    const { isQueryBuilder } = usePlayerUIContext();

    const [
        sessionFeedIsInTopScrollPosition,
        setSessionFeedIsInTopScrollPosition,
    ] = useState(true);

    // Used to determine if we need to show the loading skeleton. The loading skeleton should only be shown on the first load and when searchParams changes. It should not show when loading more sessions via infinite scroll.
    const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(true);
    const {
        searchParams,
        showStarredSessions,
        setSearchParams,
        searchQuery,
    } = useSearchContext();
    const { show_live_sessions } = searchParams;
    const { integrated } = useIntegrated();

    const { data: billingDetails } = useGetBillingDetailsForProjectQuery({
        variables: { project_id },
    });
    const { data: unprocessedSessionsCount } = useUnprocessedSessionsCountQuery(
        {
            variables: {
                project_id,
            },
            pollInterval: 5000,
        }
    );

    const {
        loading: loadingOpenSearch,
        fetchMore: fetchOpenSearch,
        called: calledOpenSearch,
    } = useGetSessionsOpenSearchQuery({
        variables: {
            query: searchQuery,
            count: count + 10,
            project_id,
        },
        onCompleted: (response) => {
            if (response?.sessions_opensearch) {
                setSessionResults(response.sessions_opensearch);
            }
            setShowLoadingSkeleton(false);
        },
        skip: !isQueryBuilder || !searchQuery,
    });

    const {
        loading: loadingOriginal,
        fetchMore: fetchOriginal,
        called: calledOriginal,
    } = useGetSessionsQuery({
        variables: {
            params: searchParams,
            count: count + 10,
            project_id,
            lifecycle:
                segment_id === LIVE_SEGMENT_ID
                    ? SessionLifecycle.All
                    : show_live_sessions
                    ? SessionLifecycle.All
                    : SessionLifecycle.Completed,
            starred: showStarredSessions,
        },
        // pollInterval: SESSIONS_FEED_POLL_INTERVAL,
        onCompleted: (response) => {
            if (response?.sessions) {
                setSessionResults(response.sessions);
            }
            setShowLoadingSkeleton(false);
        },
        skip: isQueryBuilder,
    });

    const called = isQueryBuilder ? calledOpenSearch : calledOriginal;
    const loading = isQueryBuilder ? loadingOpenSearch : loadingOriginal;
    const fetchMore = isQueryBuilder ? fetchOpenSearch : fetchOriginal;

    useEffect(() => {
        if (loading) {
            setShowLoadingSkeleton(true);
        }
        // Don't subscribe to loading. We only want to show the loading skeleton if changing the search params causing loading in a new set of sessions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const enableLiveSessions = useCallback(() => {
        if (!searchParams.query) {
            setSearchParams({
                ...searchParams,
                show_live_sessions: true,
            });
        } else {
            // Replace any 'custom_processed' values with ['true', 'false']
            const processedRule = ['custom_processed', 'is', 'true', 'false'];
            const currentState = JSON.parse(
                searchParams.query
            ) as QueryBuilderState;
            const newRules = currentState.rules.map((rule) =>
                rule[0] === processedRule[0] ? processedRule : rule
            );
            setSearchParams({
                ...searchParams,
                query: JSON.stringify({
                    isAnd: currentState.isAnd,
                    rules: newRules,
                }),
            });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        // We're showing live sessions for new users.
        // The assumption here is if a project is on the free plan and the project has less than 15 sessions than there must be live sessions.
        // We show live sessions along with the processed sessions so the user isn't confused on why sessions are not showing up in the feed.
        if (
            billingDetails?.billingDetailsForProject &&
            integrated &&
            project_id !== DEMO_WORKSPACE_APPLICATION_ID &&
            project_id !== DEMO_WORKSPACE_PROXY_APPLICATION_ID &&
            !showLiveSessions(searchParams)
        ) {
            if (
                billingDetails.billingDetailsForProject.plan.type ===
                    PlanType.Free &&
                billingDetails.billingDetailsForProject.meter < 15
            ) {
                enableLiveSessions();
            }
        }
    }, [
        billingDetails?.billingDetailsForProject,
        enableLiveSessions,
        integrated,
        project_id,
        searchParams,
        setSearchParams,
    ]);

    const infiniteRef = useInfiniteScroll({
        checkInterval: 1200, // frequency to check (1.2s)
        loading,
        hasNextPage: sessionResults.sessions.length < sessionResults.totalCount,
        scrollContainer: 'parent',
        onLoadMore: () => {
            setCount((previousCount) => previousCount + 10);
            fetchMore({
                variables: {
                    params: searchParams,
                    count,
                    project_id,
                    processed:
                        segment_id === LIVE_SEGMENT_ID
                            ? SessionLifecycle.Live
                            : searchParams.show_live_sessions
                            ? SessionLifecycle.Live
                            : SessionLifecycle.Completed,
                },
            });
        },
    });

    const filteredSessions = useMemo(() => {
        if (loading) {
            return sessionResults.sessions;
        }
        if (searchParams.hide_viewed) {
            return sessionResults.sessions.filter(
                (session) => !session?.viewed
            );
        }
        return sessionResults.sessions;
    }, [loading, searchParams.hide_viewed, sessionResults.sessions]);

    const onFeedScrollListener = (
        e: React.UIEvent<HTMLElement> | undefined
    ) => {
        setSessionFeedIsInTopScrollPosition(e?.currentTarget.scrollTop === 0);
    };

    return (
        <SessionFeedConfigurationContextProvider
            value={sessionFeedConfiguration}
        >
            <div className={styles.fixedContent}>
                <div className={styles.resultCount}>
                    {sessionResults.totalCount === -1 ? (
                        <Skeleton width="100px" />
                    ) : (
                        <div className={styles.resultCountValueContainer}>
                            <span className={styles.countContainer}>
                                <Tooltip
                                    title={`${sessionResults.totalCount.toLocaleString()} sessions`}
                                >
                                    <TextTransition
                                        inline
                                        text={`${formatCount(
                                            sessionResults.totalCount,
                                            sessionFeedConfiguration.countFormat
                                        )}`}
                                    />{' '}
                                    {`sessions `}
                                </Tooltip>
                                {unprocessedSessionsCount?.unprocessedSessionsCount >
                                    0 &&
                                    !showLiveSessions(searchParams) && (
                                        <button
                                            className={
                                                styles.liveSessionsCountButton
                                            }
                                            onClick={() => {
                                                message.success(
                                                    'Showing live sessions'
                                                );
                                                enableLiveSessions();
                                            }}
                                        >
                                            (
                                            {formatCount(
                                                unprocessedSessionsCount?.unprocessedSessionsCount,
                                                sessionFeedConfiguration.countFormat
                                            )}{' '}
                                            live)
                                        </button>
                                    )}
                            </span>
                            <div className={styles.sessionFeedActions}>
                                <Switch
                                    label="Autoplay"
                                    checked={autoPlaySessions}
                                    onChange={(checked) => {
                                        setAutoPlaySessions(checked);
                                    }}
                                    trackingId="SessionFeedAutoplay"
                                />
                                <Switch
                                    label="Details"
                                    checked={showDetailedSessionView}
                                    onChange={(checked) => {
                                        setShowDetailedSessionView(checked);
                                    }}
                                    trackingId="SessionFeedShowDetails"
                                />
                                <SessionFeedConfiguration
                                    configuration={sessionFeedConfiguration}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div
                className={classNames(styles.feedContent, {
                    [styles.hasScrolled]: !sessionFeedIsInTopScrollPosition,
                })}
                onScroll={onFeedScrollListener}
            >
                <div
                    ref={infiniteRef as RefObject<HTMLDivElement>}
                    onScroll={onFeedScrollListener}
                >
                    {showLoadingSkeleton ? (
                        <Skeleton
                            height={!showDetailedSessionView ? 74 : 125}
                            count={3}
                            style={{
                                borderRadius: 8,
                                marginBottom: 14,
                            }}
                        />
                    ) : (
                        <>
                            {!sessionResults.sessions.length &&
                            called &&
                            !loading ? (
                                showStarredSessions ? (
                                    <SearchEmptyState
                                        item={'sessions'}
                                        customTitle="Your project doesn't have starred sessions."
                                        customDescription="Starring a session is like bookmarking a website. It gives you a way to tag a session that you want to look at again. You can star a session by clicking the star icon next to the user details in the session's right panel."
                                    />
                                ) : (
                                    <SearchEmptyState item={'sessions'} />
                                )
                            ) : (
                                <>
                                    {!isOnPrem && <LimitedSessionCard />}
                                    {filteredSessions.map((u) => (
                                        <MinimalSessionCard
                                            session={u}
                                            key={u?.secure_id}
                                            selected={
                                                session_secure_id ===
                                                u?.secure_id
                                            }
                                            autoPlaySessions={autoPlaySessions}
                                            showDetailedSessionView={
                                                showDetailedSessionView
                                            }
                                            configuration={{
                                                countFormat:
                                                    sessionFeedConfiguration.countFormat,
                                                datetimeFormat:
                                                    sessionFeedConfiguration.datetimeFormat,
                                            }}
                                        />
                                    ))}
                                </>
                            )}
                            {sessionResults.sessions.length <
                                sessionResults.totalCount && (
                                <Skeleton
                                    height={74}
                                    style={{
                                        borderRadius: 8,
                                        marginBottom: 24,
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </SessionFeedConfigurationContextProvider>
    );
});
