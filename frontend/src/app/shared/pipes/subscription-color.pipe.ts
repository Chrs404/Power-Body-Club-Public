import { Pipe, PipeTransform } from '@angular/core';
import { SubscriptionInfo } from '../../core/models/client.model';

/** Colore Ionic in base ai giorni residui dell'abbonamento. */
@Pipe({ name: 'subscriptionColor' })
export class SubscriptionColorPipe implements PipeTransform {
  transform(subscription: SubscriptionInfo | null): string {
    if (!subscription || subscription.daysLeft === null) return 'medium';
    if (subscription.daysLeft < 0) return 'danger';
    if (subscription.daysLeft <= 15) return 'warning';
    return 'success';
  }
}
