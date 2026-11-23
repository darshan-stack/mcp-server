CREATE TABLE `postSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`topics` text NOT NULL,
	`tone` text NOT NULL,
	`paused` int NOT NULL DEFAULT 0,
	`generationTaskUid` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `postSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `postSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`category` varchar(32) NOT NULL DEFAULT 'manual',
	`source` enum('ai','manual') NOT NULL DEFAULT 'manual',
	`status` enum('pending','publishing','published','rejected','failed','unknown') NOT NULL DEFAULT 'pending',
	`slotKey` varchar(40),
	`xPostId` varchar(32),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	`publishedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `posts_slotKey_unique` UNIQUE(`slotKey`),
	CONSTRAINT `posts_xPostId_unique` UNIQUE(`xPostId`)
);
--> statement-breakpoint
ALTER TABLE `postSettings` ADD CONSTRAINT `postSettings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `posts` ADD CONSTRAINT `posts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;