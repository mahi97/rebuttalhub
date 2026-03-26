import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type RebuttalScope = 'reviewer' | 'all';

interface ParsedResponseTarget {
  reviewId: string;
  reviewerName: string | null;
  label: string;
  response: string;
}

interface ChangeSetEntry {
  pointId: string;
  reviewId: string;
  reviewerName: string | null;
  label: string;
  previousFinalResponse: string | null;
  nextFinalResponse: string;
}

interface PointRecord {
  id: string;
  review_id: string;
  label: string | null;
  section: string | null;
  final_response: string | null;
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || '';
}

function parseReviewerContent(content: string) {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { thankYouNote: null as string | null, responses: [] as Array<{ label: string; response: string }> };
  }

  const firstResponseMarker = trimmedContent.search(/(?:^|\n)---\n>\s*\*\*/);
  const thankYouNote = firstResponseMarker === -1
    ? trimmedContent
    : trimmedContent.slice(0, firstResponseMarker).trim();

  const responseRegion = firstResponseMarker === -1
    ? ''
    : trimmedContent.slice(firstResponseMarker);

  const responses: Array<{ label: string; response: string }> = [];
  const blockPattern = /\*\*Response\s+(.+?):\*\*\s*([\s\S]*?)(?=(?:\n---\n>\s*\*\*|\n\*\*\*\n|\n# Rebuttal to |\s*$))/g;

  let match: RegExpExecArray | null = blockPattern.exec(responseRegion);
  while (match) {
    responses.push({
      label: match[1].trim(),
      response: match[2].trim(),
    });
    match = blockPattern.exec(responseRegion);
  }

  return {
    thankYouNote: thankYouNote || null,
    responses,
  };
}

function parseCombinedSections(content: string) {
  return content
    .trim()
    .split(/\n(?=# Rebuttal to )/g)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const match = section.match(/^# Rebuttal to (.+?)\n+([\s\S]*)$/);
      if (!match) return null;

      return {
        reviewerName: match[1].trim(),
        content: match[2].replace(/\n\*\*\*\s*$/, '').trim(),
      };
    })
    .filter(Boolean) as Array<{ reviewerName: string; content: string }>;
}

function parseChangeSet(rawChangeSet: unknown): ChangeSetEntry[] {
  if (!Array.isArray(rawChangeSet)) return [];

  return rawChangeSet
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const value = entry as Record<string, unknown>;

      if (
        typeof value.pointId !== 'string' ||
        typeof value.reviewId !== 'string' ||
        typeof value.label !== 'string' ||
        typeof value.nextFinalResponse !== 'string'
      ) {
        return null;
      }

      return {
        pointId: value.pointId,
        reviewId: value.reviewId,
        reviewerName: typeof value.reviewerName === 'string' ? value.reviewerName : null,
        label: value.label,
        previousFinalResponse: typeof value.previousFinalResponse === 'string' ? value.previousFinalResponse : null,
        nextFinalResponse: value.nextFinalResponse,
      };
    })
    .filter(Boolean) as ChangeSetEntry[];
}

async function getAuthorizedClients() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const mutationClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceClient()
    : supabase;

  return { supabase, mutationClient, user };
}

async function updatePointFinalResponse(
  mutationClient: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>,
  pointId: string,
  finalResponse: string | null
) {
  const { data, error } = await mutationClient
    .from('review_points')
    .update({
      final_response: finalResponse,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pointId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('A task could not be updated while applying merged changes');
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthorizedClients();
    if (auth.error) return auth.error;

    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const { data: versions, error: versionsError } = await supabase
      .from('rebuttal_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (versionsError) {
      return NextResponse.json({ error: versionsError.message }, { status: 500 });
    }

    const { data: applications, error: applicationsError } = await supabase
      .from('rebuttal_version_applications')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (applicationsError) {
      return NextResponse.json({ error: applicationsError.message }, { status: 500 });
    }

    return NextResponse.json({
      versions: versions || [],
      applications: applications || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthorizedClients();
    if (auth.error) return auth.error;

    const { supabase, user } = auth;
    const {
      projectId,
      reviewId = null,
      reviewerName = null,
      scope,
      content,
    } = await request.json();

    if (!projectId || !scope || typeof content !== 'string') {
      return NextResponse.json({ error: 'projectId, scope, and content are required' }, { status: 400 });
    }

    if (scope !== 'reviewer' && scope !== 'all') {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }

    if (!content.trim()) {
      return NextResponse.json({ error: 'Cannot save an empty merged version' }, { status: 400 });
    }

    const { data: version, error } = await supabase
      .from('rebuttal_versions')
      .insert({
        project_id: projectId,
        review_id: scope === 'reviewer' ? reviewId : null,
        reviewer_name: scope === 'reviewer' ? reviewerName : null,
        scope: scope as RebuttalScope,
        content: content.trim(),
        metadata: {},
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthorizedClients();
    if (auth.error) return auth.error;

    const { supabase, mutationClient, user } = auth;
    const { action, versionId, applicationId } = await request.json();

    if (action === 'apply') {
      if (!versionId) {
        return NextResponse.json({ error: 'versionId required' }, { status: 400 });
      }

      const { data: version, error: versionError } = await supabase
        .from('rebuttal_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (versionError) {
        return NextResponse.json({ error: versionError.message }, { status: 500 });
      }

      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('id, reviewer_name')
        .eq('project_id', version.project_id);

      if (reviewsError) {
        return NextResponse.json({ error: reviewsError.message }, { status: 500 });
      }

      const reviewsByName = new Map(
        (reviews || []).map((review) => [review.reviewer_name, review.id])
      );

      const { data: points, error: pointsError } = await supabase
        .from('review_points')
        .select('id, review_id, label, section, final_response')
        .eq('project_id', version.project_id)
        .is('deleted_at', null);

      if (pointsError) {
        return NextResponse.json({ error: pointsError.message }, { status: 500 });
      }

      const pointLookup = new Map<string, PointRecord>();
      (points || []).forEach((point: PointRecord) => {
        pointLookup.set(`${point.review_id}::${normalizeKey(point.label)}`, point);
        pointLookup.set(`${point.review_id}::${normalizeKey(point.section)}`, point);
      });

      const targets: ParsedResponseTarget[] = [];

      if (version.scope === 'all') {
        const sections = parseCombinedSections(version.content);

        sections.forEach((section) => {
          const reviewId = reviewsByName.get(section.reviewerName);
          if (!reviewId) return;

          const parsed = parseReviewerContent(section.content);
          if (parsed.thankYouNote) {
            targets.push({
              reviewId,
              reviewerName: section.reviewerName,
              label: 'Thank You',
              response: parsed.thankYouNote,
            });
          }

          parsed.responses.forEach((response) => {
            targets.push({
              reviewId,
              reviewerName: section.reviewerName,
              label: response.label,
              response: response.response,
            });
          });
        });
      } else {
        const reviewId = version.review_id || (version.reviewer_name ? reviewsByName.get(version.reviewer_name) : null);
        if (!reviewId) {
          return NextResponse.json(
            { error: 'This saved rebuttal version is not linked to a reviewer anymore' },
            { status: 400 }
          );
        }

        const parsed = parseReviewerContent(version.content);
        if (parsed.thankYouNote) {
          targets.push({
            reviewId,
            reviewerName: version.reviewer_name,
            label: 'Thank You',
            response: parsed.thankYouNote,
          });
        }

        parsed.responses.forEach((response) => {
          targets.push({
            reviewId,
            reviewerName: version.reviewer_name,
            label: response.label,
            response: response.response,
          });
        });
      }

      const changes: ChangeSetEntry[] = [];
      targets.forEach((target) => {
        const point = pointLookup.get(`${target.reviewId}::${normalizeKey(target.label)}`);
        if (!point) return;

        const normalizedNextResponse = target.response.trim();
        const normalizedCurrentResponse = point.final_response?.trim() || '';

        if (normalizedNextResponse === normalizedCurrentResponse) return;

        changes.push({
          pointId: point.id,
          reviewId: target.reviewId,
          reviewerName: target.reviewerName,
          label: target.label,
          previousFinalResponse: point.final_response,
          nextFinalResponse: normalizedNextResponse,
        });
      });

      if (changes.length === 0) {
        return NextResponse.json(
          { error: 'No matching task responses were found to apply from this saved version' },
          { status: 400 }
        );
      }

      const appliedChanges: ChangeSetEntry[] = [];

      try {
        for (const change of changes) {
          await updatePointFinalResponse(mutationClient, change.pointId, change.nextFinalResponse);
          appliedChanges.push(change);
        }
      } catch (error: any) {
        for (const appliedChange of appliedChanges.reverse()) {
          try {
            await updatePointFinalResponse(mutationClient, appliedChange.pointId, appliedChange.previousFinalResponse);
          } catch {
            // Best effort rollback.
          }
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: application, error: applicationError } = await supabase
        .from('rebuttal_version_applications')
        .insert({
          version_id: version.id,
          project_id: version.project_id,
          applied_by: user.id,
          change_set: changes,
        })
        .select('*')
        .single();

      if (applicationError) {
        for (const appliedChange of appliedChanges.reverse()) {
          try {
            await updatePointFinalResponse(mutationClient, appliedChange.pointId, appliedChange.previousFinalResponse);
          } catch {
            // Best effort rollback.
          }
        }

        return NextResponse.json({ error: applicationError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        updatedCount: changes.length,
        application,
      });
    }

    if (action === 'revert') {
      if (!applicationId) {
        return NextResponse.json({ error: 'applicationId required' }, { status: 400 });
      }

      const { data: application, error: applicationError } = await supabase
        .from('rebuttal_version_applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (applicationError) {
        return NextResponse.json({ error: applicationError.message }, { status: 500 });
      }

      if (application.reverted_at) {
        return NextResponse.json({ error: 'This transfer was already reverted' }, { status: 400 });
      }

      const changeSet = parseChangeSet(application.change_set);
      if (changeSet.length === 0) {
        return NextResponse.json({ error: 'This transfer has no revertible changes' }, { status: 400 });
      }

      const revertedChanges: ChangeSetEntry[] = [];

      try {
        for (const change of changeSet) {
          await updatePointFinalResponse(mutationClient, change.pointId, change.previousFinalResponse);
          revertedChanges.push(change);
        }
      } catch (error: any) {
        for (const revertedChange of revertedChanges.reverse()) {
          try {
            await updatePointFinalResponse(mutationClient, revertedChange.pointId, revertedChange.nextFinalResponse);
          } catch {
            // Best effort rollback.
          }
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: revertedApplication, error: revertError } = await supabase
        .from('rebuttal_version_applications')
        .update({
          reverted_at: new Date().toISOString(),
          reverted_by: user.id,
        })
        .eq('id', application.id)
        .select('*')
        .single();

      if (revertError) {
        for (const revertedChange of revertedChanges.reverse()) {
          try {
            await updatePointFinalResponse(mutationClient, revertedChange.pointId, revertedChange.nextFinalResponse);
          } catch {
            // Best effort rollback.
          }
        }

        return NextResponse.json({ error: revertError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        revertedCount: changeSet.length,
        application: revertedApplication,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
