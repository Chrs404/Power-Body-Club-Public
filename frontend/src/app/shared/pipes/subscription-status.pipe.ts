import { Pipe, PipeTransform } from '@angular/core';
import { SubscriptionInfo } from '../../core/models/client.model';

@Pipe({ name: 'subscriptionStatus' })
export class SubscriptionStatusPipe implements PipeTransform {
  transform(subscription: SubscriptionInfo | null): string {
    if (!subscription) return 'Nessun abbonamento';

    const days = subscription.daysLeft;
    if (days === null) return 'Nessun abbonamento';
    if (days < 0) {
      const elapsed = Math.abs(days);
      return elapsed === 1 ? 'Scaduto ieri' : `Scaduto da ${elapsed} giorni`;
    }
    if (days === 0) return 'Scade oggi';
    if (days === 1) return 'Scade domani';
    return `Scade tra ${days} giorni`;
  }
}
