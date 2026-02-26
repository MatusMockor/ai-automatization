export class RepositoryResponseDto {
  id!: string;
  fullName!: string;
  cloneUrl!: string;
  defaultBranch!: string;
  isCloned!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
