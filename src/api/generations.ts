import { supabase } from '../lib/supabase';

export interface Generation {
  id: string;
  user_id: string;
  input_context: {
    mainGoal: string;
    expertRole: string;
    targetAudience: string;
    toneOfVoice: string;
    toneOfVoiceOther?: string;
    outputFormat?: string;
    outputFormatOther?: string;
    constraints?: string;
  };
  output_result: {
    name: string;
    description: string;
    instructions: string;
    tools: string;
    knowledgeBase?: { title: string; url: string }[] | null;
  };
  revision_tokens_left: number;
  revision_reset_at?: string | null;
  created_at: string;
}

/** Fetch all saved generations for a user, newest first */
export async function fetchUserGenerations(userId: string): Promise<Generation[]> {
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Generation[];
}

/** Fetch one saved generation owned by the current user */
export async function fetchGenerationById(
  gemId: string,
  userId: string
): Promise<Generation> {
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('id', gemId)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data as Generation;
}

/** Delete a single generation record */
export async function deleteGeneration(id: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('generations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId) // extra safety: only delete own records
    .select(); // Return deleted rows to verify deletion

  if (error) throw error;
  
  // Verify that at least one row was actually deleted (catches RLS block silently returning 0 rows)
  if (!data || data.length === 0) {
    throw new Error('Failed to delete from database. Please check Supabase RLS policies.');
  }
}

/** Save a new generation record, returns the inserted generation's ID */
export async function saveGeneration(
  userId: string,
  inputContext: Generation['input_context'],
  outputResult: Generation['output_result'],
  initialTokens: number = 20
): Promise<string> {
  const { data, error } = await supabase.from('generations').insert({
    user_id: userId,
    input_context: inputContext,
    output_result: outputResult,
    revision_tokens_left: initialTokens,
  }).select('id').single();

  if (error) throw error;
  return data.id;
}

/** Update a generation's output content (for accepting revisions) */
export async function updateGeneration(
  gemId: string,
  userId: string,
  updatedOutput: Partial<Generation['output_result']>
): Promise<void> {
  // Fetch current output to merge updates
  const { data: current, error: fetchError } = await supabase
    .from('generations')
    .select('output_result')
    .eq('id', gemId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  const mergedOutput = { ...(current.output_result || {}), ...updatedOutput };

  const { error: updateError } = await supabase
    .from('generations')
    .update({ output_result: mergedOutput })
    .eq('id', gemId)
    .eq('user_id', userId);

  if (updateError) throw updateError;
}

/** Deduct one revision token from a generation */
export async function deductRevisionToken(
  gemId: string,
  userId: string
): Promise<number> {
  // First get current token count
  const { data: current, error: fetchError } = await supabase
    .from('generations')
    .select('revision_tokens_left')
    .eq('id', gemId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  const newCount = Math.max(0, (current.revision_tokens_left || 0) - 1);

  const { error: updateError } = await supabase
    .from('generations')
    .update({ revision_tokens_left: newCount })
    .eq('id', gemId)
    .eq('user_id', userId);

  if (updateError) throw updateError;
  return newCount;
}
