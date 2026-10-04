import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  FieldPath,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { Invite } from '../models';
import { AlertService } from '../shared/alert.service';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase.providers';

/**
 * Invite links: `/join/<inviteId>`. The random invite id is the secret; the
 * security rules only let someone add themselves to a list or household while
 * recording, under their own uid, an invite for that target that is under 7
 * days old — so knowing the list or household id alone is never enough.
 */
@Injectable({ providedIn: 'root' })
export class InviteService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);

  async share(kind: Invite['kind'], targetId: string, targetName: string): Promise<void> {
    const created = await addDoc(collection(this.db, 'invites'), {
      kind,
      targetId,
      targetName,
      createdBy: this.auth.uid,
      createdAt: serverTimestamp(),
    });
    // Always the hosted URL: inside the Android app location.origin is localhost.
    const url = `${environment.appUrl}/join/${created.id}`;
    const text = `הצטרפות ל"${targetName}" (הקישור בתוקף 7 ימים)`;
    if (navigator.share) {
      try {
        await navigator.share({ title: targetName, text, url });
        return;
      } catch {
        // Cancelled, or not allowed here: fall back to the clipboard.
      }
    }
    await navigator.clipboard.writeText(url);
    await this.alert.presentToast('קישור ההזמנה הועתק (בתוקף 7 ימים)');
  }

  async get(inviteId: string): Promise<Invite | null> {
    const snap = await getDoc(doc(this.db, 'invites', inviteId));
    return snap.exists() ? (snap.data() as Invite) : null;
  }

  /** Returns the route to open afterwards. */
  async join(inviteId: string, invite: Invite): Promise<string> {
    const uid = this.auth.uid;
    if (!uid) {
      throw new Error('No signed-in user');
    }
    const collectionName = invite.kind === 'list' ? 'lists' : 'households';
    const target = doc(this.db, collectionName, invite.targetId);
    const route = invite.kind === 'list' ? `/details/${invite.targetId}` : '/households';
    // Readable already means already a member (directly or via a household).
    const already = await getDoc(target).then(
      (s) => s.exists() && (s.get('memberUids') as string[]).includes(uid),
      () => false,
    );
    if (!already) {
      await updateDoc(
        target,
        'memberUids',
        arrayUnion(uid),
        new FieldPath('joinedAt', uid),
        serverTimestamp(),
        new FieldPath('invites', uid),
        inviteId,
      );
    }
    return route;
  }
}
