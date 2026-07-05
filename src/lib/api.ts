import { supabase } from './supabase';

export async function callEdgeFunction<T>(
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ data?: T; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload
    });

    if (error) {
      return { error: error.message };
    }

    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function triggerExtraction(documentId: string) {
  return callEdgeFunction('extract-document', { document_id: documentId });
}

export async function triggerAggregation(projectId: string) {
  return callEdgeFunction('aggregate-report', { project_id: projectId });
}
