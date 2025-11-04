import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { id_proc } = await req.json();

    if (!id_proc) {
      throw new Error('id_proc is required');
    }

    console.log(`Listing attachments for user ${user.id}, process ${id_proc}`);

    // Get files from Supabase metadata table
    const { data: files, error: listError } = await supabase
      .from('arquivos_enviados')
      .select('*')
      .eq('id_proc', id_proc)
      .eq('user_id', user.id)
      .order('data_envio', { ascending: false });

    if (listError) {
      console.error('Error listing files:', listError);
      throw listError;
    }

    // Format response (no URLs since files are in R2 and not downloadable)
    const filesFormatted = (files || []).map(file => ({
      name: file.nome_arquivo,
      size: file.tamanho,
      created_at: file.data_envio,
      status: file.status,
      url: null, // No download URL as per requirements
    }));

    return new Response(
      JSON.stringify({ files: filesFormatted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in list-attachments:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
