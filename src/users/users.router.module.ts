import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';

import { ProfileModule } from './profile/profile.module';
import { PublicModule } from './public/public.module';
import { FollowModule } from './follow/follow.module';
import { FollowRequestsModule } from './follow-requests/follow-requests.module';
import { RelationsModule } from './relations/relations.module';
import { CloseFriendsModule } from './close-friends/close-friends.module';
import { BlockedModule } from './blocked/blocked.module';
import { FeedModule } from './feed/feed.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ProfileModule,
    PublicModule,
    FollowModule,
    FollowRequestsModule,
    RelationsModule,
    CloseFriendsModule,
    BlockedModule,
    FeedModule,
    SearchModule,
    RouterModule.register([
      {
        path: 'users',
        children: [
          { path: 'me', module: ProfileModule },
          { path: 'follow-requests', module: FollowRequestsModule },
          { path: 'close-friends', module: CloseFriendsModule },
          { path: 'blocked', module: BlockedModule },
          { path: 'feed', module: FeedModule },
          { path: 'search', module: SearchModule },
          { path: '', module: RelationsModule },
          { path: '', module: FollowModule },
          { path: '', module: PublicModule },
        ],
      },
    ]),
  ],
})
export class UsersRouterModule {}
