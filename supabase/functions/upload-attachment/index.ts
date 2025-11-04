import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3?target=deno';

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

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const id_proc = formData.get('id_proc') as string;

    if (!file || !id_proc) {
      throw new Error('File and id_proc are required');
    }

    console.log(`Uploading file ${file.name} for user ${user.id}, process ${id_proc}`);

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

    // Read file content
    const fileBuffer = await file.arrayBuffer();

    // Create file path
    const filePath = `${id_proc}/${file.name}`;

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: 'webproc',
      Key: filePath,
      Body: new Uint8Array(fileBuffer),
      ContentType: file.type || 'application/octet-stream',
    });

    await s3Client.send(command);

    // Save metadata to Supabase
    const { error: insertError } = await supabase
      .from('arquivos_enviados')
      .insert({
        id_proc: parseInt(id_proc),
        user_id: user.id,
        nome_arquivo: file.name,
        tamanho: file.size,
        status: 'armazenado',
      });

    if (insertError) {
      console.error('Error saving metadata:', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true, fileName: file.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in upload-attachment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
