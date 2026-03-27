'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, Scissors, Copy, Download, Save, History, Upload, RotateCcw, X } from 'lucide-react';
import { useLLM } from '@/hooks/useLLM';
import CharacterCounter from './CharacterCounter';
import RebuttalPreview from './RebuttalPreview';
import RebuttalDiffView from './RebuttalDiffView';
import toast from 'react-hot-toast';
import type {
  ReviewPoint,
  Review,
  Project,
  RebuttalVersion,
  RebuttalVersionApplication,
} from '@/types';
import { DEFAULT_REBUTTAL_TEMPLATE, DEFAULT_GUIDELINES } from '@/types';

interface RebuttalCompilerProps {
  reviews: Review[];
  points: ReviewPoint[];
  project: Project | null;
  onRefresh?: () => Promise<void>;
}

type PolishScope = 'all_reviewers' | 'reviewer' | 'response';

interface ResponseBlock {
  label: string;
  response: string;
}

interface PolishProposal {
  scope: PolishScope;
  targetReviewer: string;
  targetLabel: string | null;
  pointText: string | null;
  beforeText: string;
  afterText: string;
  rawProposalText: string;
}

interface SnapshotGroup {
  key: string;
  title: string;
  versions: RebuttalVersion[];
}

const ALL_REVIEWERS_KEY = '__all_reviewers__';

const POLISH_CHANGE_OPTIONS = [
  { id: 'clarity', label: 'Clarity and flow' },
  { id: 'concise', label: 'Conciseness' },
  { id: 'stronger', label: 'Stronger arguments' },
  { id: 'tone', label: 'Professional tone' },
  { id: 'template', label: 'Template / structure' },
  { id: 'grammar', label: 'Grammar and wording' },
];

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function normalizeLabel(value: string | null | undefined) {
  return value?.trim().toLowerCase() || '';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSurroundingSeparators(text: string) {
  return text
    .replace(/^(?:---\s*\n+)+/g, '')
    .replace(/\n+(?:---\s*)+$/g, '')
    .trim();
}

function formatMergedResponseBlock(
  point: Pick<ReviewPoint, 'label' | 'section' | 'point_text'>,
  response: string
) {
  const cleanedResponse = stripSurroundingSeparators(response);
  if (!cleanedResponse) return '';

  const blockLabel = point.label || point.section;
  if (blockLabel) {
    const responseHeaderPattern = new RegExp(`\\*\\*Response\\s+${escapeRegExp(blockLabel)}\\s*:\\*\\*`, 'i');
    const summaryHeaderPattern = new RegExp(`(^|\\n)>\\s*\\*\\*${escapeRegExp(blockLabel)}\\s*:\\*\\*`, 'i');

    if (responseHeaderPattern.test(cleanedResponse) || summaryHeaderPattern.test(cleanedResponse)) {
      return cleanedResponse;
    }
  }

  return [
    `> **${blockLabel}:** *${point.point_text.slice(0, 200)}${point.point_text.length > 200 ? '...' : ''}*`,
    '',
    `**Response ${blockLabel}:** ${cleanedResponse}`,
  ].join('\n').trim();
}

function getHistoryKey(version: RebuttalVersion, reviewsById: Map<string, Review>) {
  if (version.scope === 'all') return ALL_REVIEWERS_KEY;
  return version.reviewer_name || reviewsById.get(version.review_id || '')?.reviewer_name || '';
}

function extractResponseBlocks(text: string): ResponseBlock[] {
  const blocks: ResponseBlock[] = [];
  const blockPattern = /\*\*Response\s+(.+?):\*\*\s*([\s\S]*?)(?=(?:\n---\n>\s*\*\*|\n\*\*\*\n|\n# Rebuttal to |\s*$))/g;

  let match = blockPattern.exec(text);
  while (match) {
    blocks.push({
      label: match[1].trim(),
      response: match[2].trim(),
    });
    match = blockPattern.exec(text);
  }

  return blocks;
}

function replaceResponseBlock(text: string, label: string, nextResponse: string) {
  let replaced = false;

  const updatedText = text.replace(
    /\*\*Response\s+(.+?):\*\*\s*([\s\S]*?)(?=(?:\n---\n>\s*\*\*|\n\*\*\*\n|\n# Rebuttal to |\s*$))/g,
    (match, foundLabel) => {
      if (replaced || normalizeLabel(foundLabel) !== normalizeLabel(label)) {
        return match;
      }

      const headerMatch = match.match(/^\*\*Response\s+.+?:\*\*\s*/);
      if (!headerMatch) {
        return match;
      }

      replaced = true;
      return `${headerMatch[0]}${nextResponse.trim()}`;
    }
  );

  return replaced ? updatedText : null;
}

export default function RebuttalCompiler({ reviews, points, project, onRefresh }: RebuttalCompilerProps) {
  const [charLimit, setCharLimit] = useState(5000);
  const [rebuttals, setRebuttals] = useState<Record<string, string>>({});
  const [activeReviewer, setActiveReviewer] = useState<string>('');
  const [versions, setVersions] = useState<RebuttalVersion[]>([]);
  const [applications, setApplications] = useState<RebuttalVersionApplication[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyActionId, setHistoryActionId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [showPolishPanel, setShowPolishPanel] = useState(false);
  const [polishScope, setPolishScope] = useState<PolishScope>('reviewer');
  const [polishReviewer, setPolishReviewer] = useState('');
  const [polishLabel, setPolishLabel] = useState('');
  const [polishChangeTypes, setPolishChangeTypes] = useState<string[]>(['clarity', 'concise', 'template']);
  const [polishInstructions, setPolishInstructions] = useState('');
  const [retryFeedback, setRetryFeedback] = useState('');
  const [polishProposal, setPolishProposal] = useState<PolishProposal | null>(null);
  const [polishBusy, setPolishBusy] = useState(false);
  const { callLLM, loading } = useLLM();

  const template = project?.rebuttal_template || DEFAULT_REBUTTAL_TEMPLATE;
  const guidelines = project?.guidelines || DEFAULT_GUIDELINES;

  const reviewerNames = useMemo(
    () => reviews.map((review) => review.reviewer_name),
    [reviews]
  );

  const reviewsByName = useMemo(
    () => new Map(reviews.map((review) => [review.reviewer_name, review])),
    [reviews]
  );

  const reviewsById = useMemo(
    () => new Map(reviews.map((review) => [review.id, review])),
    [reviews]
  );

  const fetchHistory = useCallback(async () => {
    if (!project?.id) {
      setVersions([]);
      setApplications([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/rebuttal-versions?projectId=${project.id}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load saved merged versions');
      }

      setVersions(payload?.versions || []);
      setApplications(payload?.applications || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load saved merged versions');
    } finally {
      setHistoryLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!polishReviewer && reviewerNames[0]) {
      setPolishReviewer(reviewerNames[0]);
    }
  }, [polishReviewer, reviewerNames]);

  const getReviewerPoints = useCallback((reviewerName: string) => {
    const review = reviewsByName.get(reviewerName);
    if (!review) return [];

    return points
      .filter((point) => point.review_id === review.id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [points, reviewsByName]);

  const buildMergedReviewerRebuttal = useCallback((reviewerName: string) => {
    const reviewerPoints = getReviewerPoints(reviewerName);
    const thankYouPoint = reviewerPoints.find((point) => point.section === 'Thank You');
    const responsePoints = reviewerPoints.filter((point) => point.section !== 'Thank You');

    const thankYou = thankYouPoint?.final_response || thankYouPoint?.draft_response || '';
    const mergedResponses = responsePoints
      .map((point) => {
        const response = point.final_response || point.draft_response;
        if (!response) return '';
        return formatMergedResponseBlock(point, response);
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    return [thankYou.trim(), mergedResponses].filter(Boolean).join('\n\n').trim();
  }, [getReviewerPoints]);

  const buildCombinedRebuttal = useCallback((sourceRebuttals: Record<string, string>) => {
    return reviewerNames
      .map((reviewerName) => {
        const text = sourceRebuttals[reviewerName]?.trim();
        if (!text) return null;
        return `# Rebuttal to ${reviewerName}\n\n${text}`;
      })
      .filter(Boolean)
      .join('\n\n***\n\n');
  }, [reviewerNames]);

  const buildFallbackCombinedRebuttal = useCallback(() => {
    const mergedByReviewer = reviewerNames.reduce<Record<string, string>>((acc, reviewerName) => {
      const merged = rebuttals[reviewerName] || buildMergedReviewerRebuttal(reviewerName);
      if (merged) {
        acc[reviewerName] = merged;
      }
      return acc;
    }, {});

    return buildCombinedRebuttal(mergedByReviewer);
  }, [buildCombinedRebuttal, buildMergedReviewerRebuttal, rebuttals, reviewerNames]);

  const setCurrentRebuttal = useCallback((key: string, value: string) => {
    setRebuttals((prev) => ({ ...prev, [key]: value }));
    setSelectedVersionId('');
  }, []);

  const openPolishPanel = useCallback((scope: PolishScope, reviewerName?: string, label?: string) => {
    const nextReviewer =
      reviewerName ||
      (activeReviewer && activeReviewer !== ALL_REVIEWERS_KEY ? activeReviewer : '') ||
      reviewerNames[0] ||
      '';

    const availablePointLabels = nextReviewer
      ? getReviewerPoints(nextReviewer)
          .filter((point) => point.section !== 'Thank You' && (point.final_response || point.draft_response))
          .map((point) => point.label)
          .filter(Boolean) as string[]
      : [];

    setShowPolishPanel(true);
    setPolishScope(scope);
    setPolishReviewer(nextReviewer);
    setPolishLabel(label || availablePointLabels[0] || '');
    setPolishProposal(null);
    setRetryFeedback('');
  }, [activeReviewer, getReviewerPoints, reviewerNames]);

  const polishablePoints = useMemo(() => {
    if (!polishReviewer) return [];

    return getReviewerPoints(polishReviewer).filter(
      (point) => point.section !== 'Thank You' && point.label && (point.final_response || point.draft_response)
    );
  }, [getReviewerPoints, polishReviewer]);

  useEffect(() => {
    if (polishScope !== 'response') return;
    if (polishablePoints.some((point) => point.label === polishLabel)) return;
    setPolishLabel(polishablePoints[0]?.label || '');
  }, [polishLabel, polishScope, polishablePoints]);

  const handleMergeReviewer = (reviewerName: string) => {
    const merged = buildMergedReviewerRebuttal(reviewerName);

    if (!merged) {
      toast.error(`No responses to merge for ${reviewerName}`);
      return;
    }

    setCurrentRebuttal(reviewerName, merged);
    setActiveReviewer(reviewerName);
    toast.success(`Merged ${reviewerName} rebuttal`);
  };

  const handleMergeAll = () => {
    const mergedByReviewer = reviewerNames.reduce<Record<string, string>>((acc, reviewerName) => {
      const merged = rebuttals[reviewerName] || buildMergedReviewerRebuttal(reviewerName);
      if (merged) {
        acc[reviewerName] = merged;
      }
      return acc;
    }, {});

    const mergedCount = Object.keys(mergedByReviewer).length;

    if (mergedCount === 0) {
      toast.error('No responses to merge across reviewers');
      return;
    }

    const combined = buildCombinedRebuttal(mergedByReviewer);

    setRebuttals((prev) => ({
      ...prev,
      ...mergedByReviewer,
      [ALL_REVIEWERS_KEY]: combined,
    }));
    setSelectedVersionId('');
    setActiveReviewer(ALL_REVIEWERS_KEY);
    toast.success(`Merged ${mergedCount} reviewer rebuttal${mergedCount > 1 ? 's' : ''}`);
  };

  const handleReduceLength = async (reviewerName: string) => {
    const text = rebuttals[reviewerName];
    if (!text) return;

    const result = await callLLM<{ rebuttal: string }>('reduce-length', {
      rebuttalText: text,
      charLimit,
    });

    if (result?.rebuttal) {
      setCurrentRebuttal(reviewerName, result.rebuttal);
    }
  };

  const handleCopy = async (reviewerKey: string) => {
    const text = reviewerKey === ALL_REVIEWERS_KEY
      ? (rebuttals[ALL_REVIEWERS_KEY] || buildFallbackCombinedRebuttal())
      : (rebuttals[reviewerKey] || '');

    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleDownload = (reviewerKey: string, format: 'md' | 'txt') => {
    const text = reviewerKey === ALL_REVIEWERS_KEY
      ? (rebuttals[ALL_REVIEWERS_KEY] || buildFallbackCombinedRebuttal())
      : (rebuttals[reviewerKey] || '');

    if (!text) {
      toast.error('Nothing to download yet');
      return;
    }

    const fileStem = reviewerKey === ALL_REVIEWERS_KEY
      ? 'rebuttal_all_reviewers'
      : `rebuttal_${reviewerKey.replace(/\s+/g, '_')}`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileStem}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    for (const reviewerName of reviewerNames) {
      const text = rebuttals[reviewerName];
      if (!text) continue;

      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rebuttal_${reviewerName.replace(/\s+/g, '_')}.md`;
      link.click();
      URL.revokeObjectURL(url);
    }

    const combined = rebuttals[ALL_REVIEWERS_KEY] || buildFallbackCombinedRebuttal();
    if (combined) {
      const blob = new Blob([combined], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rebuttal_all_reviewers.md';
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!project?.id || !activeReviewer) return;

    const isCombinedView = activeReviewer === ALL_REVIEWERS_KEY;
    const activeReview = isCombinedView ? null : reviewsByName.get(activeReviewer);
    const content = isCombinedView
      ? (rebuttals[ALL_REVIEWERS_KEY] || buildFallbackCombinedRebuttal())
      : (rebuttals[activeReviewer] || '');

    if (!content.trim()) {
      toast.error('Nothing to save yet');
      return;
    }

    if (!isCombinedView && !activeReview) {
      toast.error('This reviewer could not be found anymore');
      return;
    }

    setHistoryActionId('save');

    try {
      const response = await fetch('/api/rebuttal-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          reviewId: activeReview?.id || null,
          reviewerName: isCombinedView ? null : activeReviewer,
          scope: isCombinedView ? 'all' : 'reviewer',
          content,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save merged version');
      }

      const version = payload?.version as RebuttalVersion;
      if (version) {
        setVersions((prev) => [version, ...prev]);
        setSelectedVersionId(version.id);
      } else {
        await fetchHistory();
      }

      toast.success('Saved a timestamped merged version');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save merged version');
    } finally {
      setHistoryActionId('');
    }
  };

  const handleOpenVersion = (version: RebuttalVersion) => {
    const key = getHistoryKey(version, reviewsById);
    if (!key) {
      toast.error('This saved version is no longer attached to a reviewer');
      return;
    }

    setRebuttals((prev) => ({ ...prev, [key]: version.content }));
    setActiveReviewer(key);
    setSelectedVersionId(version.id);
  };

  const handleApplyVersion = async (version: RebuttalVersion) => {
    if (!confirm('Transfer this saved merged version back into the task cards? Only final responses are updated, and the transfer can be reverted.')) {
      return;
    }

    setHistoryActionId(`apply:${version.id}`);

    try {
      const response = await fetch('/api/rebuttal-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          versionId: version.id,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to transfer merged changes');
      }

      await Promise.all([fetchHistory(), onRefresh?.() || Promise.resolve()]);
      toast.success(`Transferred ${payload?.updatedCount || 0} response${payload?.updatedCount === 1 ? '' : 's'} to task cards`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to transfer merged changes');
    } finally {
      setHistoryActionId('');
    }
  };

  const handleRevertApplication = async (application: RebuttalVersionApplication) => {
    if (!confirm('Revert the last transfer from this saved merged version? This restores the previous final responses on the affected task cards.')) {
      return;
    }

    setHistoryActionId(`revert:${application.id}`);

    try {
      const response = await fetch('/api/rebuttal-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revert',
          applicationId: application.id,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to revert transferred changes');
      }

      await Promise.all([fetchHistory(), onRefresh?.() || Promise.resolve()]);
      toast.success(`Reverted ${payload?.revertedCount || 0} transferred response${payload?.revertedCount === 1 ? '' : 's'}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to revert transferred changes');
    } finally {
      setHistoryActionId('');
    }
  };

  const buildPolishRequest = useCallback(() => {
    if (polishScope === 'all_reviewers') {
      const beforeText = rebuttals[ALL_REVIEWERS_KEY] || buildFallbackCombinedRebuttal();
      if (!beforeText.trim()) {
        toast.error('Merge or write some reviewer rebuttals first');
        return null;
      }

      return {
        scope: 'all_reviewers' as PolishScope,
        targetReviewer: ALL_REVIEWERS_KEY,
        targetLabel: null as string | null,
        pointText: null as string | null,
        beforeText,
        sourceText: beforeText,
      };
    }

    const reviewerName =
      polishReviewer ||
      (activeReviewer && activeReviewer !== ALL_REVIEWERS_KEY ? activeReviewer : '') ||
      reviewerNames[0] ||
      '';

    if (!reviewerName) {
      toast.error('Pick a reviewer first');
      return null;
    }

    const beforeText = rebuttals[reviewerName] || buildMergedReviewerRebuttal(reviewerName);
    if (!beforeText.trim()) {
      toast.error(`No ready rebuttal text found for ${reviewerName}`);
      return null;
    }

    if (polishScope === 'reviewer') {
      return {
        scope: 'reviewer' as PolishScope,
        targetReviewer: reviewerName,
        targetLabel: null as string | null,
        pointText: null as string | null,
        beforeText,
        sourceText: beforeText,
      };
    }

    if (!polishLabel) {
      toast.error('Pick a response to polish');
      return null;
    }

    const point = polishablePoints.find((candidate) => candidate.label === polishLabel) || null;
    const responseBlock = extractResponseBlocks(beforeText).find(
      (block) => normalizeLabel(block.label) === normalizeLabel(polishLabel)
    );

    if (!responseBlock) {
      toast.error(`Could not find ${polishLabel} inside the current rebuttal`);
      return null;
    }

    return {
      scope: 'response' as PolishScope,
      targetReviewer: reviewerName,
      targetLabel: polishLabel,
      pointText: point?.point_text || null,
      beforeText,
      sourceText: responseBlock.response,
    };
  }, [
    activeReviewer,
    buildFallbackCombinedRebuttal,
    buildMergedReviewerRebuttal,
    polishLabel,
    polishReviewer,
    polishScope,
    polishablePoints,
    rebuttals,
    reviewerNames,
  ]);

  const handleGeneratePolishProposal = async (feedbackOverride?: string) => {
    const request = buildPolishRequest();
    if (!request) return;

    setPolishBusy(true);
    try {
      const result = await callLLM<{ proposal: string }>('polish-rebuttal', {
        scope: request.scope,
        reviewerName: request.targetReviewer === ALL_REVIEWERS_KEY ? undefined : request.targetReviewer,
        label: request.targetLabel || undefined,
        pointText: request.pointText || undefined,
        currentText: request.sourceText,
        template,
        guidelines,
        charLimit: request.scope === 'all_reviewers' ? undefined : charLimit,
        changeTypes: polishChangeTypes.map((id) => POLISH_CHANGE_OPTIONS.find((option) => option.id === id)?.label || id),
        feedback: [polishInstructions.trim(), feedbackOverride?.trim()].filter(Boolean).join('\n\n') || undefined,
        previousAttempt: feedbackOverride && polishProposal ? polishProposal.rawProposalText : undefined,
      });

      const proposalText = result?.proposal?.trim();
      if (!proposalText) return;

      const afterText = request.scope === 'response'
        ? replaceResponseBlock(request.beforeText, request.targetLabel || '', proposalText)
        : proposalText;

      if (!afterText) {
        toast.error('Could not map the revised response back into the rebuttal');
        return;
      }

      if (afterText.trim() === request.beforeText.trim()) {
        toast.error('The proposal did not change the text');
        return;
      }

      setPolishProposal({
        scope: request.scope,
        targetReviewer: request.targetReviewer,
        targetLabel: request.targetLabel,
        pointText: request.pointText,
        beforeText: request.beforeText,
        afterText: afterText.trim(),
        rawProposalText: proposalText,
      });

      setRetryFeedback('');
      setActiveReviewer(request.targetReviewer);
    } finally {
      setPolishBusy(false);
    }
  };

  const handleAcceptPolishProposal = () => {
    if (!polishProposal) return;

    setCurrentRebuttal(polishProposal.targetReviewer, polishProposal.afterText);
    setActiveReviewer(polishProposal.targetReviewer);
    setPolishProposal(null);
    setRetryFeedback('');
    toast.success('AI proposal applied. Review it and save a snapshot if you want to keep it.');
  };

  const handleRetryPolishProposal = async () => {
    if (!retryFeedback.trim()) {
      toast.error('Add feedback for the retry first');
      return;
    }

    await handleGeneratePolishProposal(retryFeedback.trim());
  };

  const isCombinedView = activeReviewer === ALL_REVIEWERS_KEY;
  const activeReview = isCombinedView ? null : reviewsByName.get(activeReviewer);
  const currentRebuttal = activeReviewer
    ? (activeReviewer === ALL_REVIEWERS_KEY
        ? (rebuttals[ALL_REVIEWERS_KEY] || buildFallbackCombinedRebuttal())
        : (rebuttals[activeReviewer] || ''))
    : '';
  const activeTitle = isCombinedView ? 'All Reviewers' : activeReviewer;

  const versionsForActiveView = useMemo(() => {
    if (!activeReviewer) return [];
    if (isCombinedView) {
      return versions.filter((version) => version.scope === 'all');
    }
    if (!activeReview) return [];

    return versions.filter((version) => version.scope === 'reviewer' && version.review_id === activeReview.id);
  }, [activeReview, activeReviewer, isCombinedView, versions]);

  const latestApplicationByVersion = useMemo(() => {
    const map = new Map<string, RebuttalVersionApplication>();
    applications.forEach((application) => {
      if (!map.has(application.version_id)) {
        map.set(application.version_id, application);
      }
    });
    return map;
  }, [applications]);

  const latestOpenApplicationByVersion = useMemo(() => {
    const map = new Map<string, RebuttalVersionApplication>();
    applications.forEach((application) => {
      if (application.reverted_at || map.has(application.version_id)) return;
      map.set(application.version_id, application);
    });
    return map;
  }, [applications]);

  const snapshotGroups = useMemo(() => {
    const groups = new Map<string, SnapshotGroup>();

    versions.forEach((version) => {
      const key = getHistoryKey(version, reviewsById);
      if (!key) return;

      const existing = groups.get(key);
      if (existing) {
        existing.versions.push(version);
        return;
      }

      groups.set(key, {
        key,
        title: key === ALL_REVIEWERS_KEY ? 'All Reviewers' : key,
        versions: [version],
      });
    });

    const orderedKeys = [
      ...(groups.has(ALL_REVIEWERS_KEY) ? [ALL_REVIEWERS_KEY] : []),
      ...reviewerNames.filter((reviewerName) => groups.has(reviewerName)),
      ...Array.from(groups.keys())
        .filter((key) => key !== ALL_REVIEWERS_KEY && !reviewerNames.includes(key))
        .sort((left, right) => left.localeCompare(right)),
    ];

    return orderedKeys.map((key) => groups.get(key)).filter(Boolean) as SnapshotGroup[];
  }, [reviewerNames, reviewsById, versions]);

  const renderSnapshotCard = useCallback((version: RebuttalVersion) => {
    const latestApplication = latestApplicationByVersion.get(version.id);
    const openApplication = latestOpenApplicationByVersion.get(version.id);
    const isSelected = selectedVersionId === version.id;

    return (
      <div
        key={version.id}
        className={`rounded-lg border p-3 ${
          isSelected ? 'border-blue-500/50 bg-blue-500/5' : 'border-[var(--border)] bg-[var(--background)]'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{formatTimestamp(version.created_at)}</span>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {version.scope === 'all' ? 'All Reviewers' : version.reviewer_name || reviewsById.get(version.review_id || '')?.reviewer_name || 'Reviewer'}
              </span>
              {isSelected && (
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                  Open now
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
              {version.content.slice(0, 220)}
            </p>
            {latestApplication && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {latestApplication.reverted_at
                  ? `Last transfer reverted on ${formatTimestamp(latestApplication.reverted_at)}`
                  : `Last transferred on ${formatTimestamp(latestApplication.created_at)}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleOpenVersion(version)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:border-blue-500/50"
            >
              Open in Editor
            </button>
            <button
              onClick={() => handleApplyVersion(version)}
              disabled={historyActionId === `apply:${version.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:border-blue-500/50 disabled:opacity-50"
            >
              {historyActionId === `apply:${version.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Transfer to Cards
            </button>
            {openApplication && (
              <button
                onClick={() => handleRevertApplication(openApplication)}
                disabled={historyActionId === `revert:${openApplication.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
              >
                {historyActionId === `revert:${openApplication.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Revert Transfer
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }, [
    handleApplyVersion,
    handleOpenVersion,
    handleRevertApplication,
    historyActionId,
    latestApplicationByVersion,
    latestOpenApplicationByVersion,
    reviewsById,
    selectedVersionId,
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Character Limit (per reviewer)
          </label>
          <input
            type="number"
            value={charLimit}
            onChange={(event) => setCharLimit(parseInt(event.target.value, 10) || 5000)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Reviewers
          </label>
          <p className="px-3 py-2 text-sm">
            {reviewerNames.length} reviewers &middot; {points.length} total points
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Compile Per Reviewer</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {reviewerNames.map((reviewerName) => {
            const reviewerPoints = getReviewerPoints(reviewerName);
            const readyCount = reviewerPoints.filter((point) => point.final_response || point.draft_response).length;
            const hasRebuttal = !!rebuttals[reviewerName];
            const hasSavedHistory = versions.some(
              (version) => version.scope === 'reviewer' && version.review_id === reviewsByName.get(reviewerName)?.id
            );

            return (
              <div
                key={reviewerName}
                className={`rounded-lg border bg-[var(--card)] p-4 ${
                  activeReviewer === reviewerName ? 'border-blue-500/50' : 'border-[var(--border)]'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{reviewerName}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {readyCount}/{reviewerPoints.length} ready
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMergeReviewer(reviewerName)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium transition-colors hover:border-blue-500/50"
                  >
                    Merge
                  </button>
                  <button
                    onClick={() => openPolishPanel('reviewer', reviewerName)}
                    disabled={loading || polishBusy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                  >
                    {(loading || polishBusy) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {hasRebuttal ? 'AI Polish...' : 'AI Draft...'}
                  </button>
                  {(hasRebuttal || hasSavedHistory) && (
                    <button
                      onClick={() => {
                        setActiveReviewer(reviewerName);
                        setSelectedVersionId('');
                      }}
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs transition-colors hover:border-blue-500/50"
                    >
                      View
                    </button>
                  )}
                  {hasRebuttal && (
                    <>
                      <button
                        onClick={() => handleCopy(reviewerName)}
                        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs transition-colors hover:border-blue-500/50"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDownload(reviewerName, 'md')}
                        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs transition-colors hover:border-blue-500/50"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleMergeAll}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium transition-colors hover:border-blue-500/50"
        >
          Merge All (no LLM)
        </button>
        <button
          onClick={() => openPolishPanel(activeReviewer && activeReviewer !== ALL_REVIEWERS_KEY ? 'reviewer' : 'all_reviewers')}
          disabled={loading || polishBusy}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {(loading || polishBusy) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI Polish...
        </button>

        {Object.keys(rebuttals).length > 0 && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm transition-colors hover:border-blue-500/50"
          >
            <Download className="h-4 w-4" />
            Download All (.md per reviewer + combined)
          </button>
        )}
      </div>

      {showPolishPanel && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">AI Polish With Review</h3>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Pick the scope, choose what kind of edits you want, then review a diff before anything is applied.
              </p>
            </div>
            <button
              onClick={() => {
                setShowPolishPanel(false);
                setPolishProposal(null);
                setRetryFeedback('');
              }}
              className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                Scope
              </label>
              <select
                value={polishScope}
                onChange={(event) => setPolishScope(event.target.value as PolishScope)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="all_reviewers">All reviewers together</option>
                <option value="reviewer">One reviewer</option>
                <option value="response">Specific response / question</option>
              </select>
            </div>

            {polishScope !== 'all_reviewers' && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Reviewer
                </label>
                <select
                  value={polishReviewer}
                  onChange={(event) => setPolishReviewer(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                >
                  {reviewerNames.map((reviewerName) => (
                    <option key={reviewerName} value={reviewerName}>
                      {reviewerName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {polishScope === 'response' && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Response
                </label>
                <select
                  value={polishLabel}
                  onChange={(event) => setPolishLabel(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                >
                  {polishablePoints.length === 0 && <option value="">No ready responses yet</option>}
                  {polishablePoints.map((point) => (
                    <option key={point.id} value={point.label}>
                      {point.label} - {point.section}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Change Types
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {POLISH_CHANGE_OPTIONS.map((option) => {
                const checked = polishChangeTypes.includes(option.id);

                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-blue-500/40 bg-blue-500/10 text-white'
                        : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setPolishChangeTypes((prev) =>
                          checked ? prev.filter((value) => value !== option.id) : [...prev, option.id]
                        );
                      }}
                      className="accent-blue-500"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Extra Instructions
            </label>
            <textarea
              value={polishInstructions}
              onChange={(event) => setPolishInstructions(event.target.value)}
              placeholder="Optional: e.g. make it firmer on novelty, keep all citations, or shorten only the thank-you tone."
              className="h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => handleGeneratePolishProposal()}
              disabled={polishBusy || loading || polishChangeTypes.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {(polishBusy || loading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Proposal
            </button>
          </div>

          {polishProposal && (
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
              <div>
                <h4 className="text-sm font-semibold">
                  Proposed Changes
                  {polishProposal.scope === 'response' && polishProposal.targetLabel ? ` for ${polishProposal.targetLabel}` : ''}
                </h4>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Review the diff first. Nothing changes in the live rebuttal until you accept.
                </p>
              </div>

              <RebuttalDiffView before={polishProposal.beforeText} after={polishProposal.afterText} />

              <div>
                <h5 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Proposed Preview
                </h5>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <RebuttalPreview content={polishProposal.afterText} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Retry Feedback
                </label>
                <textarea
                  value={retryFeedback}
                  onChange={(event) => setRetryFeedback(event.target.value)}
                  placeholder="Tell the AI what to change on the next attempt, for example: keep the stronger wording but make Q2 shorter."
                  className="h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => {
                    setPolishProposal(null);
                    setRetryFeedback('');
                  }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:border-white/20 hover:text-white"
                >
                  Discard
                </button>
                <button
                  onClick={handleRetryPolishProposal}
                  disabled={!retryFeedback.trim() || polishBusy || loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition-colors hover:border-blue-500/50 disabled:opacity-50"
                >
                  {(polishBusy || loading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Retry With Feedback
                </button>
                <button
                  onClick={handleAcceptPolishProposal}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                >
                  <Upload className="h-4 w-4" />
                  Accept Proposal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--muted-foreground)]" />
            <div>
              <h3 className="text-sm font-semibold">Snapshots</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                Every time you click Save Snapshot, it appears here. Open one in the editor, or transfer it back to task cards from this section.
              </p>
            </div>
          </div>
          {historyLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading snapshots...
            </span>
          )}
        </div>

        {snapshotGroups.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No snapshots saved yet.
          </p>
        ) : (
          <div className="space-y-4">
            {snapshotGroups.map((group) => (
              <div
                key={group.key}
                className={`rounded-xl border p-4 ${
                  activeReviewer === group.key
                    ? 'border-blue-500/40 bg-blue-500/5'
                    : 'border-[var(--border)] bg-[var(--background)]'
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{group.title}</h4>
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      {group.versions.length} snapshot{group.versions.length === 1 ? '' : 's'}
                    </span>
                    {activeReviewer === group.key && (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                        Open in editor
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleOpenVersion(group.versions[0])}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:border-blue-500/50"
                  >
                    Open Latest Snapshot
                  </button>
                </div>

                <div className="space-y-3">
                  {group.versions.map((version) => renderSnapshotCard(version))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeReviewer && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Rebuttal for {activeTitle}</h3>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Edit in place, or use AI polish proposals above and review the diff before accepting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isCombinedView && currentRebuttal.length > charLimit && (
                <button
                  onClick={() => handleReduceLength(activeReviewer)}
                  disabled={loading || polishBusy}
                  className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1 text-xs text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  <Scissors className="h-3 w-3" />
                  Reduce Length
                </button>
              )}
              <button
                onClick={handleSaveSnapshot}
                disabled={!currentRebuttal.trim() || historyActionId === 'save'}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs transition-colors hover:border-blue-500/50 disabled:opacity-50"
              >
                {historyActionId === 'save' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Snapshot
              </button>
              <button
                onClick={() => handleCopy(activeReviewer)}
                disabled={!currentRebuttal.trim()}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs transition-colors hover:border-blue-500/50 disabled:opacity-50"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
              <button
                onClick={() => handleDownload(activeReviewer, 'md')}
                disabled={!currentRebuttal.trim()}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs transition-colors hover:border-blue-500/50 disabled:opacity-50"
              >
                <Download className="h-3 w-3" />
                Download
              </button>
            </div>
          </div>

          {!isCombinedView && (
            <CharacterCounter current={currentRebuttal.length} limit={charLimit} />
          )}
          {isCombinedView && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Combined text can be edited directly here, or polished through the scoped AI panel above.
            </p>
          )}

          <div className="mt-3">
            <textarea
              value={currentRebuttal}
              onChange={(event) => setCurrentRebuttal(activeReviewer, event.target.value)}
              placeholder={isCombinedView ? 'Merge all reviewers first or open a saved combined version.' : 'Merge this reviewer to start editing.'}
              className="h-64 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <h4 className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">Preview</h4>
            <RebuttalPreview content={currentRebuttal} />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--muted-foreground)]" />
                <div>
                  <h4 className="text-sm font-semibold">Snapshots for This View</h4>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    The full snapshot browser is above. This filtered list stays focused on the rebuttal currently open in the editor.
                  </p>
                </div>
              </div>
              {historyLoading && (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading history...
                </span>
              )}
            </div>

            {versionsForActiveView.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No saved versions yet for {activeTitle.toLowerCase()}.
              </p>
            ) : (
              <div className="space-y-3">
                {versionsForActiveView.map((version) => renderSnapshotCard(version))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
