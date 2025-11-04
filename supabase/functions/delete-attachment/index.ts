import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, DeleteObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3?target=deno';

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

    const { id_proc, fileName } = await req.json();

    if (!id_proc || !fileName) {
      throw new Error('id_proc and fileName are required');
    }

    console.log(`Deleting attachment ${fileName} for user ${user.id}, process ${id_proc}`);

    // Get R2 credentials
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')!;
    const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!;
    const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')!;

    // Configure S3 client for R2
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    // Create file path
    const filePath = `${id_proc}/${fileName}`;

    // Delete from R2
    const command = new DeleteObjectCommand({
      Bucket: 'webproc',
      Key: filePath,
    });

    try {
      await s3Client.send(command);
    } catch (error) {
      // If file doesn't exist, continue (don't fail)
      console.log('File may not exist in R2:', error.message);
    }

    // Delete metadata from Supabase
    const { error: deleteError } = await supabase
      .from('arquivos_enviados')
      .delete()
      .eq('id_proc', id_proc)
      .eq('user_id', user.id)
      .eq('nome_arquivo', fileName);

    if (deleteError) {
      console.error('Error deleting metadata:', deleteError);
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-attachment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
