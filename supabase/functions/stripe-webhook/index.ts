import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2024-04-10',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const sig  = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err) {
    console.error('Webhook signature invalid:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }

  switch (event.type) {

    // Payment succeeded → upgrade household to pro
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId   = session.client_reference_id;          // sbUser.id passed in URL
      const custId   = session.customer as string;
      if (!userId) { console.error('No client_reference_id'); break; }

      const { data: hh, error } = await supabase
        .from('households')
        .select('id')
        .eq('owner_id', userId)
        .single();

      if (error || !hh) { console.error('Household not found for user', userId); break; }

      await supabase
        .from('households')
        .update({ plan: 'pro', stripe_customer_id: custId })
        .eq('id', hh.id);

      console.log('Upgraded household', hh.id, 'to pro');
      break;
    }

    // Subscription cancelled or expired → downgrade to free
    case 'customer.subscription.deleted': {
      const sub    = event.data.object as Stripe.Subscription;
      const custId = sub.customer as string;

      const { data: hh } = await supabase
        .from('households')
        .select('id')
        .eq('stripe_customer_id', custId)
        .single();

      if (hh) {
        await supabase
          .from('households')
          .update({ plan: 'free' })
          .eq('id', hh.id);
        console.log('Downgraded household', hh.id, 'to free');
      }
      break;
    }

    // Payment failed — optional: you could email the user here
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      console.warn('Payment failed for customer:', inv.customer);
      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
