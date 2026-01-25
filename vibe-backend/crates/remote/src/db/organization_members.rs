use sqlx::{Executor, PgPool, Postgres};
pub use utils::api::organizations::MemberRole;
use uuid::Uuid;

use super::identity_errors::IdentityError;

pub(super) async fn add_member<'a, E>(
    executor: E,
    organization_id: Uuid,
    user_id: Uuid,
    role: MemberRole,
) -> Result<(), sqlx::Error>
where
    E: Executor<'a, Database = Postgres>,
{
    sqlx::query!(
        r#"
        INSERT INTO organization_member_metadata (organization_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (organization_id, user_id) DO UPDATE
        SET role = EXCLUDED.role
        "#,
        organization_id,
        user_id,
        role as MemberRole
    )
    .execute(executor)
    .await?;

    Ok(())
}

pub(super) async fn check_user_role(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<Option<MemberRole>, IdentityError> {
    let result = sqlx::query!(
        r#"
        SELECT role AS "role!: MemberRole"
        FROM organization_member_metadata
        WHERE organization_id = $1 AND user_id = $2
        "#,
        organization_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(result.map(|r| r.role))
}

pub async fn is_member<'a, E>(
    executor: E,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<bool, IdentityError>
where
    E: Executor<'a, Database = Postgres>,
{
    // Check membership in multiple ways:
    // 1. tenant_workspace_members - direct workspace membership (join on email since twm uses Clerk IDs)
    // 2. organization_member_metadata - legacy organization membership
    // 3. team_members - membership via team that belongs to a workspace with matching projects
    // 4. projects with tenant_workspace_id - if user is member of that workspace
    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            -- Check direct workspace membership via tenant_workspace_members
            SELECT 1 FROM tenant_workspace_members twm
            JOIN users u ON twm.email = u.email
            WHERE twm.tenant_workspace_id = $1 AND u.id = $2
        ) OR EXISTS(
            -- Check legacy organization membership
            SELECT 1 FROM organization_member_metadata
            WHERE organization_id = $1 AND user_id = $2
        ) OR EXISTS(
            -- Check if user is member of a team that has this organization/workspace
            -- team_members uses email, so join with users table
            SELECT 1 FROM team_members tm
            JOIN teams t ON tm.team_id = t.id
            JOIN users u ON tm.email = u.email
            WHERE u.id = $2 AND (
                t.tenant_workspace_id = $1 OR
                EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.organization_id = $1
                    AND (p.tenant_workspace_id = t.tenant_workspace_id OR p.organization_id = t.tenant_workspace_id)
                )
            )
        ) OR EXISTS(
            -- Check if user is in a workspace that owns projects with this organization_id
            SELECT 1 FROM tenant_workspace_members twm
            JOIN users u ON twm.email = u.email
            JOIN projects p ON p.tenant_workspace_id = twm.tenant_workspace_id
            WHERE u.id = $2 AND p.organization_id = $1
        ) AS "exists!"
        "#,
        organization_id,
        user_id
    )
    .fetch_one(executor)
    .await?;

    Ok(exists)
}

pub(crate) async fn assert_membership(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
    let exists = is_member(pool, organization_id, user_id).await?;

    if exists {
        Ok(())
    } else {
        Err(IdentityError::NotFound)
    }
}

pub(super) async fn assert_admin(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
    let role = check_user_role(pool, organization_id, user_id).await?;
    match role {
        Some(MemberRole::Admin) => Ok(()),
        _ => Err(IdentityError::PermissionDenied),
    }
}
